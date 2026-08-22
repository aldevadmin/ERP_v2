import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework.test import APIClient

from apps.processes.models import ProcessCategory, ProcessDefinition, ProcessDefinitionVersion

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

    response = client.get("/api/v1/process-categories/")

    assert response.status_code == 403


def test_list_returns_categories(organization):
    ProcessCategory.objects.create(name="Production", organization=organization)
    client = _client_as("Export Coordinator", "coord1")

    response = client.get("/api/v1/process-categories/")

    assert response.status_code == 200
    assert response.json()["results"][0]["name"] == "Production"


def test_create_category():
    client = _client_as("Export Coordinator", "coord2")

    response = client.post("/api/v1/process-categories/", {"name": "Movement"}, format="json")

    assert response.status_code == 201
    category = ProcessCategory.objects.get(name="Movement")
    assert category.organization_id is not None  # auto-defaulted, never sent by the client


def test_create_rejects_duplicate_name(organization):
    ProcessCategory.objects.create(name="Packing", organization=organization)
    client = _client_as("Export Coordinator", "coord3")

    response = client.post("/api/v1/process-categories/", {"name": "Packing"}, format="json")

    assert response.status_code == 400


def test_update_category(organization):
    category = ProcessCategory.objects.create(name="Quality", organization=organization)
    client = _client_as("Manager/Admin", "mgr1")

    response = client.patch(
        f"/api/v1/process-categories/{category.id}/", {"is_active": False}, format="json"
    )

    assert response.status_code == 200
    category.refresh_from_db()
    assert category.is_active is False


def test_filter_by_is_active(organization):
    ProcessCategory.objects.create(name="Active Cat", organization=organization, is_active=True)
    ProcessCategory.objects.create(name="Inactive Cat", organization=organization, is_active=False)
    client = _client_as("Export Coordinator", "coord4")

    response = client.get("/api/v1/process-categories/?is_active=false")

    names = [c["name"] for c in response.json()["results"]]
    assert names == ["Inactive Cat"]


def test_delete_unused_category_succeeds(organization):
    category = ProcessCategory.objects.create(name="Movement", organization=organization)
    client = _client_as("Manager/Admin", "mgr2")

    response = client.delete(f"/api/v1/process-categories/{category.id}/")

    assert response.status_code == 204
    assert not ProcessCategory.objects.filter(id=category.id).exists()


def test_delete_category_used_by_process_is_blocked(organization):
    category = ProcessCategory.objects.create(name="Movement", organization=organization)
    definition = ProcessDefinition.objects.create(
        name="Washing", code="WASH", organization=organization
    )
    ProcessDefinitionVersion.objects.create(
        process_definition=definition,
        version_number=1,
        category=category,
        organization=organization,
    )
    client = _client_as("Manager/Admin", "mgr3")

    response = client.delete(f"/api/v1/process-categories/{category.id}/")

    assert response.status_code == 400
    assert ProcessCategory.objects.filter(id=category.id).exists()
