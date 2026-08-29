import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework.test import APIClient

from apps.items.models import UOM, Item, MaterialType, ProductType, Shape

pytestmark = pytest.mark.django_db

User = get_user_model()


def _client_as(role_name: str, username: str) -> APIClient:
    client = APIClient()
    user = User.objects.create_user(username=username, password="x")
    user.groups.add(Group.objects.get(name=role_name))
    client.force_authenticate(user=user)
    return client


def test_list_returns_shapes(organization):
    Shape.objects.create(name="Hexagon", short_code="HX", organization=organization)
    client = _client_as("Export Coordinator", "coord1")

    response = client.get("/api/v1/shapes/")

    names = [s["name"] for s in response.json()["results"]]
    assert response.status_code == 200
    assert "Hexagon" in names


def test_create_shape(organization):
    client = _client_as("Manager/Admin", "mgr1")

    response = client.post(
        "/api/v1/shapes/", {"name": "Pentagon", "short_code": "PN"}, format="json"
    )

    assert response.status_code == 201
    assert Shape.objects.filter(name="Pentagon", short_code="PN").exists()


def test_delete_unused_shape_succeeds(organization):
    shape = Shape.objects.create(name="Diamond", short_code="DM", organization=organization)
    client = _client_as("Manager/Admin", "mgr2")

    response = client.delete(f"/api/v1/shapes/{shape.id}/")

    assert response.status_code == 204
    assert not Shape.objects.filter(id=shape.id).exists()


def test_delete_shape_used_by_item_is_blocked(organization):
    shape = Shape.objects.create(name="Hexagon", short_code="HX", organization=organization)
    product_type = ProductType.objects.create(name="Plate", organization=organization)
    material_type = MaterialType.objects.create(name="Areca Palm", organization=organization)
    uom = UOM.objects.create(code="PC3", name="Piece3", organization=organization)
    Item.objects.create(
        code="FG-2",
        name="10 in Round Plate",
        item_class=Item.ItemClass.FINISHED_GOOD,
        product_type=product_type,
        material_type=material_type,
        shape=shape,
        inventory_uom=uom,
        organization=organization,
    )
    client = _client_as("Manager/Admin", "mgr3")

    response = client.delete(f"/api/v1/shapes/{shape.id}/")

    assert response.status_code == 400
    assert Shape.objects.filter(id=shape.id).exists()
