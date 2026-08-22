import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework.test import APIClient

from apps.work_centres.models import WorkCentre, WorkCentreType

pytestmark = pytest.mark.django_db

User = get_user_model()


def _client_as(role_name: str, username: str) -> APIClient:
    client = APIClient()
    user = User.objects.create_user(username=username, password="x")
    user.groups.add(Group.objects.get(name=role_name))
    client.force_authenticate(user=user)
    return client


def test_list_returns_work_centre_types(organization):
    WorkCentreType.objects.create(name="Assembly Line", organization=organization)
    client = _client_as("Export Coordinator", "coord1")

    response = client.get("/api/v1/work-centre-types/")

    names = [t["name"] for t in response.json()["results"]]
    assert response.status_code == 200
    assert "Assembly Line" in names


def test_create_work_centre_type(organization):
    client = _client_as("Manager/Admin", "mgr1")

    response = client.post("/api/v1/work-centre-types/", {"name": "Line"}, format="json")

    assert response.status_code == 201
    assert WorkCentreType.objects.filter(name="Line").exists()


def test_delete_unused_type_succeeds(organization):
    work_centre_type = WorkCentreType.objects.create(name="Kiosk", organization=organization)
    client = _client_as("Manager/Admin", "mgr2")

    response = client.delete(f"/api/v1/work-centre-types/{work_centre_type.id}/")

    assert response.status_code == 204
    assert not WorkCentreType.objects.filter(id=work_centre_type.id).exists()


def test_delete_type_used_by_work_centre_is_blocked(organization):
    work_centre_type = WorkCentreType.objects.create(name="Assembly Line", organization=organization)
    WorkCentre.objects.create(
        code="WC-1", name="Press 01", type=work_centre_type, organization=organization
    )
    client = _client_as("Manager/Admin", "mgr3")

    response = client.delete(f"/api/v1/work-centre-types/{work_centre_type.id}/")

    assert response.status_code == 400
    assert WorkCentreType.objects.filter(id=work_centre_type.id).exists()
