import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework.test import APIClient

from apps.tooling.models import Tooling, ToolingType

pytestmark = pytest.mark.django_db

User = get_user_model()


def _client_as(role_name: str, username: str) -> APIClient:
    client = APIClient()
    user = User.objects.create_user(username=username, password="x")
    user.groups.add(Group.objects.get(name=role_name))
    client.force_authenticate(user=user)
    return client


def test_list_returns_tooling_types(organization):
    ToolingType.objects.create(name="Welding Jig", organization=organization)
    client = _client_as("Export Coordinator", "coord1")

    response = client.get("/api/v1/tooling-types/")

    names = [t["name"] for t in response.json()["results"]]
    assert response.status_code == 200
    assert "Welding Jig" in names


def test_create_tooling_type(organization):
    client = _client_as("Manager/Admin", "mgr1")

    response = client.post("/api/v1/tooling-types/", {"name": "Punch"}, format="json")

    assert response.status_code == 201
    assert ToolingType.objects.filter(name="Punch").exists()


def test_delete_unused_type_succeeds(organization):
    tooling_type = ToolingType.objects.create(name="Stamp", organization=organization)
    client = _client_as("Manager/Admin", "mgr2")

    response = client.delete(f"/api/v1/tooling-types/{tooling_type.id}/")

    assert response.status_code == 204
    assert not ToolingType.objects.filter(id=tooling_type.id).exists()


def test_delete_type_used_by_tooling_is_blocked(organization):
    tooling_type = ToolingType.objects.create(name="Welding Jig", organization=organization)
    Tooling.objects.create(
        code="MLD-1", name="Mould 1", tooling_type=tooling_type, organization=organization
    )
    client = _client_as("Manager/Admin", "mgr3")

    response = client.delete(f"/api/v1/tooling-types/{tooling_type.id}/")

    assert response.status_code == 400
    assert ToolingType.objects.filter(id=tooling_type.id).exists()
