import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework.test import APIClient

from apps.items.models import UOM, Item, MaterialType

pytestmark = pytest.mark.django_db

User = get_user_model()


def _client_as(role_name: str, username: str) -> APIClient:
    client = APIClient()
    user = User.objects.create_user(username=username, password="x")
    user.groups.add(Group.objects.get(name=role_name))
    client.force_authenticate(user=user)
    return client


def test_list_returns_material_types(organization):
    MaterialType.objects.create(name="Wood Veneer", organization=organization)
    client = _client_as("Export Coordinator", "coord1")

    response = client.get("/api/v1/material-types/")

    names = [t["name"] for t in response.json()["results"]]
    assert response.status_code == 200
    assert "Wood Veneer" in names


def test_create_material_type(organization):
    client = _client_as("Manager/Admin", "mgr1")

    response = client.post("/api/v1/material-types/", {"name": "Paper"}, format="json")

    assert response.status_code == 201
    assert MaterialType.objects.filter(name="Paper").exists()


def test_create_material_type_defaults_to_no_restriction(organization):
    client = _client_as("Manager/Admin", "mgr-scope1")

    response = client.post("/api/v1/material-types/", {"name": "Rattan"}, format="json")

    assert response.status_code == 201
    assert response.json()["applicable_item_classes"] == []


def test_create_material_type_scoped_to_packaging_material(organization):
    client = _client_as("Manager/Admin", "mgr-scope2")

    response = client.post(
        "/api/v1/material-types/",
        {"name": "Kraft Paper", "applicable_item_classes": ["PACKAGING_MATERIAL"]},
        format="json",
    )

    assert response.status_code == 201
    assert response.json()["applicable_item_classes"] == ["PACKAGING_MATERIAL"]


def test_delete_unused_type_succeeds(organization):
    material_type = MaterialType.objects.create(name="Bamboo", organization=organization)
    client = _client_as("Manager/Admin", "mgr2")

    response = client.delete(f"/api/v1/material-types/{material_type.id}/")

    assert response.status_code == 204
    assert not MaterialType.objects.filter(id=material_type.id).exists()


def test_delete_type_used_by_item_is_blocked(organization):
    material_type = MaterialType.objects.create(name="Areca Palm", organization=organization)
    uom = UOM.objects.create(code="KG2", name="Kilogram2", organization=organization)
    Item.objects.create(
        code="RM-1",
        name="Raw Areca Leaf",
        item_class=Item.ItemClass.RAW_MATERIAL,
        material_type=material_type,
        inventory_uom=uom,
        organization=organization,
    )
    client = _client_as("Manager/Admin", "mgr3")

    response = client.delete(f"/api/v1/material-types/{material_type.id}/")

    assert response.status_code == 400
    assert MaterialType.objects.filter(id=material_type.id).exists()
