import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework.test import APIClient

from apps.materials.models import Material

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

    response = client.get("/api/v1/materials/")

    assert response.status_code == 403


def test_list_returns_materials(organization):
    Material.objects.create(code="MAT-1", name="Raw Leaf", unit="Kg", organization=organization)
    client = _client_as("Export Coordinator", "coord1")

    response = client.get("/api/v1/materials/")

    assert response.status_code == 200
    assert response.json()["results"][0]["code"] == "MAT-1"


def test_create_material():
    client = _client_as("Export Coordinator", "coord2")

    response = client.post(
        "/api/v1/materials/",
        {"code": "MAT-2", "name": "Dye", "unit": "Litre"},
        format="json",
    )

    assert response.status_code == 201
    material = Material.objects.get(code="MAT-2")
    assert material.organization_id is not None  # auto-defaulted, never sent by the client


def test_create_rejects_duplicate_code(organization):
    Material.objects.create(code="MAT-3", name="Raw Leaf", unit="Kg", organization=organization)
    client = _client_as("Export Coordinator", "coord3")

    response = client.post(
        "/api/v1/materials/", {"code": "MAT-3", "name": "Dup", "unit": "Kg"}, format="json"
    )

    assert response.status_code == 400


def test_update_material(organization):
    material = Material.objects.create(
        code="MAT-4", name="Raw Leaf", unit="Kg", organization=organization
    )
    client = _client_as("Manager/Admin", "mgr1")

    response = client.patch(
        f"/api/v1/materials/{material.id}/", {"is_active": False}, format="json"
    )

    assert response.status_code == 200
    material.refresh_from_db()
    assert material.is_active is False


def test_search_by_code_or_name(organization):
    Material.objects.create(code="ABC", name="Foo Leaf", unit="Kg", organization=organization)
    Material.objects.create(code="XYZ", name="Bar Dye", unit="Litre", organization=organization)
    client = _client_as("Export Coordinator", "coord4")

    response = client.get("/api/v1/materials/?search=Foo")

    results = response.json()["results"]
    assert len(results) == 1
    assert results[0]["code"] == "ABC"


def test_filter_by_is_active(organization):
    Material.objects.create(
        code="ACT", name="Active", unit="Kg", organization=organization, is_active=True
    )
    Material.objects.create(
        code="INA", name="Inactive", unit="Kg", organization=organization, is_active=False
    )
    client = _client_as("Export Coordinator", "coord5")

    response = client.get("/api/v1/materials/?is_active=false")

    codes = [m["code"] for m in response.json()["results"]]
    assert codes == ["INA"]


def test_no_delete_route(organization):
    material = Material.objects.create(
        code="MAT-5", name="Raw Leaf", unit="Kg", organization=organization
    )
    client = _client_as("Manager/Admin", "mgr2")

    response = client.delete(f"/api/v1/materials/{material.id}/")

    assert response.status_code == 405
