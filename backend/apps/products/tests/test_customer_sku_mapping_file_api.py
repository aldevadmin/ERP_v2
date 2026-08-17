import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from apps.customers.models import Customer
from apps.products.models import CustomerSKUMapping, CustomerSKUMappingFile, Product

pytestmark = pytest.mark.django_db

User = get_user_model()


def _client_as(role_name: str, username: str) -> APIClient:
    client = APIClient()
    user = User.objects.create_user(username=username, password="x")
    user.groups.add(Group.objects.get(name=role_name))
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def customer(organization):
    return Customer.objects.create(
        code="CUST-1", name="Acme Exports", organization=organization
    )


@pytest.fixture
def product(organization):
    return Product.objects.create(
        sku_code="SKU-1", name="Areca Plate", base_unit="Piece", organization=organization
    )


@pytest.fixture
def mapping(customer, product):
    return CustomerSKUMapping.objects.create(
        customer=customer, customer_sku_code="A1", product=product
    )


def _files_url(mapping: CustomerSKUMapping) -> str:
    return f"/api/v1/customer-sku-mappings/{mapping.id}/files/"


def _file_detail_url(mapping: CustomerSKUMapping, file_id: int) -> str:
    return f"/api/v1/customer-sku-mappings/{mapping.id}/files/{file_id}/"


def _image(name: str = "plate.jpg") -> SimpleUploadedFile:
    return SimpleUploadedFile(name, b"file-bytes", content_type="image/jpeg")


def test_upload_plate_image(mapping):
    client = _client_as("Export Coordinator", "coord1")

    response = client.post(
        _files_url(mapping),
        {"category": "PLATE_IMAGE", "file": _image()},
        format="multipart",
    )

    assert response.status_code == 201
    body = response.json()
    assert body["category"] == "PLATE_IMAGE"


def test_upload_design_file_pdf(mapping):
    client = _client_as("Export Coordinator", "coord2")
    pdf = SimpleUploadedFile("design.pdf", b"%PDF-1.4", content_type="application/pdf")

    response = client.post(
        _files_url(mapping), {"category": "DESIGN_FILE", "file": pdf}, format="multipart"
    )

    assert response.status_code == 201


def test_upload_oversized_file_rejected(mapping):
    client = _client_as("Export Coordinator", "coord3")
    oversized = SimpleUploadedFile(
        "plate.jpg", b"x" * (5 * 1024 * 1024 + 1), content_type="image/jpeg"
    )

    response = client.post(
        _files_url(mapping), {"category": "PLATE_IMAGE", "file": oversized}, format="multipart"
    )

    assert response.status_code == 400


def test_upload_disallowed_content_type_rejected(mapping):
    client = _client_as("Export Coordinator", "coord4")
    bad_file = SimpleUploadedFile("design.ai", b"data", content_type="application/postscript")

    response = client.post(
        _files_url(mapping), {"category": "DESIGN_FILE", "file": bad_file}, format="multipart"
    )

    assert response.status_code == 400


def test_eleventh_file_in_max_ten_category_rejected(mapping):
    client = _client_as("Export Coordinator", "coord5")
    for i in range(10):
        response = client.post(
            _files_url(mapping),
            {"category": "PLATE_IMAGE", "file": _image(f"plate{i}.jpg")},
            format="multipart",
        )
        assert response.status_code == 201

    response = client.post(
        _files_url(mapping),
        {"category": "PLATE_IMAGE", "file": _image("plate11.jpg")},
        format="multipart",
    )

    assert response.status_code == 400
    assert "file" in response.json()


def test_fourth_retail_sticker_image_rejected(mapping):
    client = _client_as("Export Coordinator", "coord6")
    for i in range(3):
        response = client.post(
            _files_url(mapping),
            {"category": "RETAIL_STICKER_IMAGE", "file": _image(f"sticker{i}.jpg")},
            format="multipart",
        )
        assert response.status_code == 201

    response = client.post(
        _files_url(mapping),
        {"category": "RETAIL_STICKER_IMAGE", "file": _image("sticker4.jpg")},
        format="multipart",
    )

    assert response.status_code == 400


def test_list_scoped_to_mapping(customer, product, mapping):
    other_mapping = CustomerSKUMapping.objects.create(
        customer=customer, customer_sku_code="B1", product=product
    )
    client = _client_as("Export Coordinator", "coord7")
    client.post(
        _files_url(mapping), {"category": "PLATE_IMAGE", "file": _image()}, format="multipart"
    )
    client.post(
        _files_url(other_mapping),
        {"category": "PLATE_IMAGE", "file": _image()},
        format="multipart",
    )

    response = client.get(_files_url(mapping))

    results = response.json()["results"]
    assert len(results) == 1


def test_filter_by_category(mapping):
    client = _client_as("Export Coordinator", "coord8")
    client.post(
        _files_url(mapping), {"category": "PLATE_IMAGE", "file": _image()}, format="multipart"
    )
    client.post(
        _files_url(mapping),
        {"category": "POUCH_IMAGE", "file": _image("pouch.jpg")},
        format="multipart",
    )

    response = client.get(f"{_files_url(mapping)}?category=POUCH_IMAGE")

    results = response.json()["results"]
    assert len(results) == 1
    assert results[0]["category"] == "POUCH_IMAGE"


def test_delete_file(mapping):
    client = _client_as("Manager/Admin", "mgr1")
    create_response = client.post(
        _files_url(mapping), {"category": "PLATE_IMAGE", "file": _image()}, format="multipart"
    )
    file_id = create_response.json()["id"]

    response = client.delete(_file_detail_url(mapping, file_id))

    assert response.status_code == 204
    assert not CustomerSKUMappingFile.objects.filter(id=file_id).exists()
