import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework.test import APIClient

from apps.products.models import Product

pytestmark = pytest.mark.django_db

User = get_user_model()


def _client_as(role_name: str, username: str) -> APIClient:
    client = APIClient()
    user = User.objects.create_user(username=username, password="x")
    user.groups.add(Group.objects.get(name=role_name))
    client.force_authenticate(user=user)
    return client


def test_list_requires_authentication():
    client = APIClient()

    response = client.get("/api/v1/products/")

    assert response.status_code == 403


def test_list_returns_products(organization):
    Product.objects.create(
        sku_code="SKU-1", name="Areca Plate", base_unit="Piece", organization=organization
    )
    client = _client_as("Export Coordinator", "coord1")

    response = client.get("/api/v1/products/")

    assert response.status_code == 200
    assert response.json()["results"][0]["sku_code"] == "SKU-1"


def test_create_product():
    client = _client_as("Export Coordinator", "coord2")

    response = client.post(
        "/api/v1/products/",
        {
            "sku_code": "SKU-2",
            "name": "Areca Bowl",
            "description": "10 inch round bowl",
            "base_unit": "Piece",
        },
        format="json",
    )

    assert response.status_code == 201
    product = Product.objects.get(sku_code="SKU-2")
    assert product.organization_id is not None  # auto-defaulted, never sent by the client


def test_create_rejects_duplicate_sku_code(organization):
    Product.objects.create(
        sku_code="SKU-3", name="Areca Plate", base_unit="Piece", organization=organization
    )
    client = _client_as("Export Coordinator", "coord3")

    response = client.post(
        "/api/v1/products/",
        {"sku_code": "SKU-3", "name": "Dup", "base_unit": "Piece"},
        format="json",
    )

    assert response.status_code == 400


def test_update_product(organization):
    product = Product.objects.create(
        sku_code="SKU-4", name="Areca Plate", base_unit="Piece", organization=organization
    )
    client = _client_as("Manager/Admin", "mgr1")

    response = client.patch(
        f"/api/v1/products/{product.id}/", {"is_active": False}, format="json"
    )

    assert response.status_code == 200
    product.refresh_from_db()
    assert product.is_active is False


def test_search_by_sku_code_or_name(organization):
    Product.objects.create(
        sku_code="ABC", name="Foo Plate", base_unit="Piece", organization=organization
    )
    Product.objects.create(
        sku_code="XYZ", name="Bar Bowl", base_unit="Piece", organization=organization
    )
    client = _client_as("Export Coordinator", "coord4")

    response = client.get("/api/v1/products/?search=Foo")

    results = response.json()["results"]
    assert len(results) == 1
    assert results[0]["sku_code"] == "ABC"


def test_filter_by_is_active(organization):
    Product.objects.create(
        sku_code="ACT", name="Active", base_unit="Piece", organization=organization, is_active=True
    )
    Product.objects.create(
        sku_code="INA",
        name="Inactive",
        base_unit="Piece",
        organization=organization,
        is_active=False,
    )
    client = _client_as("Export Coordinator", "coord5")

    response = client.get("/api/v1/products/?is_active=false")

    codes = [p["sku_code"] for p in response.json()["results"]]
    assert codes == ["INA"]


def test_no_delete_route(organization):
    product = Product.objects.create(
        sku_code="SKU-5", name="Areca Plate", base_unit="Piece", organization=organization
    )
    client = _client_as("Manager/Admin", "mgr2")

    response = client.delete(f"/api/v1/products/{product.id}/")

    assert response.status_code == 405
