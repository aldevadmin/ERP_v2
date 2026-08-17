import pytest
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.customers.models import Customer
from apps.products.models import (
    CustomerSKUMapping,
    CustomerSKUMappingFile,
    Product,
    validate_upload_file_size,
    validate_upload_file_type,
)

pytestmark = pytest.mark.django_db


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


def test_new_structured_fields_default_to_unset(mapping):
    assert mapping.pouch_height_inches is None
    assert mapping.carton_ply_rating == ""
    assert mapping.carton_length_mm is None
    assert mapping.pouch_thickness_microns is None
    assert mapping.has_retail_sticker is None
    assert mapping.retail_sticker_comments == ""
    assert mapping.has_silica_gel is None


def test_validate_upload_file_size_rejects_oversized_file():
    oversized = SimpleUploadedFile(
        "plate.jpg", b"x" * (5 * 1024 * 1024 + 1), content_type="image/jpeg"
    )

    with pytest.raises(ValidationError):
        validate_upload_file_size(oversized)


def test_validate_upload_file_size_accepts_file_at_limit():
    at_limit = SimpleUploadedFile("plate.jpg", b"x" * (5 * 1024 * 1024), content_type="image/jpeg")

    validate_upload_file_size(at_limit)  # does not raise


def test_validate_upload_file_type_rejects_disallowed_type():
    bad_type = SimpleUploadedFile("design.ai", b"data", content_type="application/postscript")

    with pytest.raises(ValidationError):
        validate_upload_file_type(bad_type)


@pytest.mark.parametrize(
    "content_type",
    ["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"],
)
def test_validate_upload_file_type_accepts_allowed_types(content_type):
    good_type = SimpleUploadedFile("file", b"data", content_type=content_type)

    validate_upload_file_type(good_type)  # does not raise


def test_customer_sku_mapping_file_str(mapping):
    file = CustomerSKUMappingFile.objects.create(
        customer_sku_mapping=mapping,
        category=CustomerSKUMappingFile.Category.PLATE_IMAGE,
        file=SimpleUploadedFile("plate.jpg", b"data", content_type="image/jpeg"),
    )

    assert str(file) == f"{mapping} — Plate Image"
