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


def test_list_returns_seeded_uoms(organization):
    client = _client_as("Export Coordinator", "coord1")

    response = client.get("/api/v1/uoms/")

    codes = [u["code"] for u in response.json()["results"]]
    assert response.status_code == 200
    assert {"PC", "KG", "POUCH", "CARTON"}.issubset(set(codes))


def test_create_uom(organization):
    client = _client_as("Manager/Admin", "mgr1")

    response = client.post(
        "/api/v1/uoms/", {"code": "BAG", "name": "Bag", "decimal_scale": 0}, format="json"
    )

    assert response.status_code == 201
    assert UOM.objects.filter(code="BAG").exists()


def test_delete_unused_uom_succeeds(organization):
    uom = UOM.objects.create(code="ROLL", name="Roll", organization=organization)
    client = _client_as("Manager/Admin", "mgr2")

    response = client.delete(f"/api/v1/uoms/{uom.id}/")

    assert response.status_code == 204
    assert not UOM.objects.filter(id=uom.id).exists()


def test_delete_uom_used_by_item_is_blocked(organization):
    uom = UOM.objects.create(code="SHEET", name="Sheet", organization=organization)
    product_type = ProductType.objects.create(name="Plate2", organization=organization)
    material_type = MaterialType.objects.create(name="Areca Palm2", organization=organization)
    Item.objects.create(
        code="FG-2",
        name="10 in Plate 2",
        item_class=Item.ItemClass.FINISHED_GOOD,
        product_type=product_type,
        material_type=material_type,
        inventory_uom=uom,
        organization=organization,
    )
    client = _client_as("Manager/Admin", "mgr3")

    response = client.delete(f"/api/v1/uoms/{uom.id}/")

    assert response.status_code == 400
    assert UOM.objects.filter(id=uom.id).exists()
