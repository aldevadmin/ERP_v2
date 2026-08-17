import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from apps.customers.models import Customer
from apps.products.models import CustomerSKUMapping, CustomerSKUMappingFile, Product

pytestmark = pytest.mark.django_db

User = get_user_model()

INTERNAL_ROLES = [
    "Export Coordinator",
    "Production Coordinator",
    "Procurement Coordinator",
    "Packing Coordinator",
    "Logistics Coordinator",
    "Manager/Admin",
]
CANNOT_MANAGE_ROLES = [
    "Production Coordinator",
    "Procurement Coordinator",
    "Packing Coordinator",
    "Logistics Coordinator",
]


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


def test_customer_role_cannot_list():
    client = _client_as("Customer", "list-customer-role")

    response = client.get("/api/v1/customer-sku-mappings/")

    assert response.status_code == 403


@pytest.mark.parametrize("role", CANNOT_MANAGE_ROLES)
def test_other_internal_roles_cannot_create(role, customer, product):
    client = _client_as(role, f"nocreate-{role}")

    response = client.post(
        "/api/v1/customer-sku-mappings/",
        {"customer": customer.id, "customer_sku_code": "A1", "product": product.id},
        format="json",
    )

    assert response.status_code == 403


@pytest.mark.parametrize("role", CANNOT_MANAGE_ROLES)
def test_other_internal_roles_cannot_delete(role, customer, product):
    mapping = CustomerSKUMapping.objects.create(
        customer=customer, customer_sku_code="A1", product=product
    )
    client = _client_as(role, f"nodelete-{role}")

    response = client.delete(f"/api/v1/customer-sku-mappings/{mapping.id}/")

    assert response.status_code == 403


def _files_url(mapping: CustomerSKUMapping) -> str:
    return f"/api/v1/customer-sku-mappings/{mapping.id}/files/"


@pytest.mark.parametrize("role", INTERNAL_ROLES)
def test_every_internal_role_can_list_files(role, customer, product):
    mapping = CustomerSKUMapping.objects.create(
        customer=customer, customer_sku_code="A1", product=product
    )
    client = _client_as(role, f"listfiles-{role}")

    response = client.get(_files_url(mapping))

    assert response.status_code == 200


def test_customer_role_cannot_list_files(customer, product):
    mapping = CustomerSKUMapping.objects.create(
        customer=customer, customer_sku_code="A1", product=product
    )
    client = _client_as("Customer", "listfiles-customer-role")

    response = client.get(_files_url(mapping))

    assert response.status_code == 403


@pytest.mark.parametrize("role", CANNOT_MANAGE_ROLES)
def test_other_internal_roles_cannot_upload_file(role, customer, product):
    mapping = CustomerSKUMapping.objects.create(
        customer=customer, customer_sku_code="A1", product=product
    )
    client = _client_as(role, f"nouploadfile-{role}")
    image = SimpleUploadedFile("plate.jpg", b"data", content_type="image/jpeg")

    response = client.post(
        _files_url(mapping), {"category": "PLATE_IMAGE", "file": image}, format="multipart"
    )

    assert response.status_code == 403


@pytest.mark.parametrize("role", CANNOT_MANAGE_ROLES)
def test_other_internal_roles_cannot_delete_file(role, customer, product):
    mapping = CustomerSKUMapping.objects.create(
        customer=customer, customer_sku_code="A1", product=product
    )
    file = CustomerSKUMappingFile.objects.create(
        customer_sku_mapping=mapping,
        category=CustomerSKUMappingFile.Category.PLATE_IMAGE,
        file=SimpleUploadedFile("plate.jpg", b"data", content_type="image/jpeg"),
    )
    client = _client_as(role, f"nodeletefile-{role}")

    response = client.delete(f"/api/v1/customer-sku-mappings/{mapping.id}/files/{file.id}/")

    assert response.status_code == 403
