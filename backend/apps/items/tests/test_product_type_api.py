import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework.test import APIClient

from apps.items.models import UOM, Item, MaterialType, ProductType

pytestmark = pytest.mark.django_db

User = get_user_model()


def _client_as(role_name: str, username: str) -> APIClient:
    client = APIClient()
    user = User.objects.create_user(username=username, password="x")
    user.groups.add(Group.objects.get(name=role_name))
    client.force_authenticate(user=user)
    return client


def test_list_returns_product_types(organization):
    ProductType.objects.create(name="Bowl", organization=organization)
    client = _client_as("Export Coordinator", "coord1")

    response = client.get("/api/v1/product-types/")

    names = [t["name"] for t in response.json()["results"]]
    assert response.status_code == 200
    assert "Bowl" in names


def test_create_product_type(organization):
    client = _client_as("Manager/Admin", "mgr1")

    response = client.post("/api/v1/product-types/", {"name": "Tray"}, format="json")

    assert response.status_code == 201
    assert ProductType.objects.filter(name="Tray").exists()


def test_delete_unused_type_succeeds(organization):
    product_type = ProductType.objects.create(name="Cup", organization=organization)
    client = _client_as("Manager/Admin", "mgr2")

    response = client.delete(f"/api/v1/product-types/{product_type.id}/")

    assert response.status_code == 204
    assert not ProductType.objects.filter(id=product_type.id).exists()


def test_delete_type_used_by_item_is_blocked(organization):
    product_type = ProductType.objects.create(name="Plate", organization=organization)
    material_type = MaterialType.objects.create(name="Areca Palm", organization=organization)
    uom = UOM.objects.create(code="PC2", name="Piece2", organization=organization)
    Item.objects.create(
        code="FG-1",
        name="10 in Plate",
        item_class=Item.ItemClass.FINISHED_GOOD,
        product_type=product_type,
        material_type=material_type,
        inventory_uom=uom,
        organization=organization,
    )
    client = _client_as("Manager/Admin", "mgr3")

    response = client.delete(f"/api/v1/product-types/{product_type.id}/")

    assert response.status_code == 400
    assert ProductType.objects.filter(id=product_type.id).exists()
