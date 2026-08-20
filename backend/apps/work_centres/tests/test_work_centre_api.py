import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework.test import APIClient

from apps.work_centres.models import WorkCentre

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

    response = client.get("/api/v1/work-centres/")

    assert response.status_code == 403


def test_list_returns_work_centres(organization):
    WorkCentre.objects.create(
        code="WC-1", name="Press 01", type=WorkCentre.Type.MACHINE, organization=organization
    )
    client = _client_as("Export Coordinator", "coord1")

    response = client.get("/api/v1/work-centres/")

    assert response.status_code == 200
    assert response.json()["results"][0]["code"] == "WC-1"


def test_create_work_centre():
    client = _client_as("Export Coordinator", "coord2")

    response = client.post(
        "/api/v1/work-centres/",
        {"code": "WC-2", "name": "Sort Station 01", "type": "STATION"},
        format="json",
    )

    assert response.status_code == 201
    work_centre = WorkCentre.objects.get(code="WC-2")
    assert work_centre.organization_id is not None  # auto-defaulted, never sent by the client


def test_create_rejects_duplicate_code(organization):
    WorkCentre.objects.create(
        code="WC-3", name="Press 01", type=WorkCentre.Type.MACHINE, organization=organization
    )
    client = _client_as("Export Coordinator", "coord3")

    response = client.post(
        "/api/v1/work-centres/",
        {"code": "WC-3", "name": "Dup", "type": "MACHINE"},
        format="json",
    )

    assert response.status_code == 400


def test_update_work_centre(organization):
    work_centre = WorkCentre.objects.create(
        code="WC-4", name="Press 01", type=WorkCentre.Type.MACHINE, organization=organization
    )
    client = _client_as("Manager/Admin", "mgr1")

    response = client.patch(
        f"/api/v1/work-centres/{work_centre.id}/", {"is_active": False}, format="json"
    )

    assert response.status_code == 200
    work_centre.refresh_from_db()
    assert work_centre.is_active is False


def test_search_by_code_or_name(organization):
    WorkCentre.objects.create(
        code="ABC", name="Foo Press", type=WorkCentre.Type.MACHINE, organization=organization
    )
    WorkCentre.objects.create(
        code="XYZ", name="Bar Station", type=WorkCentre.Type.STATION, organization=organization
    )
    client = _client_as("Export Coordinator", "coord4")

    response = client.get("/api/v1/work-centres/?search=Foo")

    results = response.json()["results"]
    assert len(results) == 1
    assert results[0]["code"] == "ABC"


def test_filter_by_is_active(organization):
    WorkCentre.objects.create(
        code="ACT",
        name="Active",
        type=WorkCentre.Type.MACHINE,
        organization=organization,
        is_active=True,
    )
    WorkCentre.objects.create(
        code="INA",
        name="Inactive",
        type=WorkCentre.Type.MACHINE,
        organization=organization,
        is_active=False,
    )
    client = _client_as("Export Coordinator", "coord5")

    response = client.get("/api/v1/work-centres/?is_active=false")

    codes = [w["code"] for w in response.json()["results"]]
    assert codes == ["INA"]


def test_filter_by_type(organization):
    WorkCentre.objects.create(
        code="MCH", name="Press 01", type=WorkCentre.Type.MACHINE, organization=organization
    )
    WorkCentre.objects.create(
        code="STN", name="Sort 01", type=WorkCentre.Type.STATION, organization=organization
    )
    client = _client_as("Export Coordinator", "coord6")

    response = client.get("/api/v1/work-centres/?type=STATION")

    codes = [w["code"] for w in response.json()["results"]]
    assert codes == ["STN"]


def test_no_delete_route(organization):
    work_centre = WorkCentre.objects.create(
        code="WC-5", name="Press 01", type=WorkCentre.Type.MACHINE, organization=organization
    )
    client = _client_as("Manager/Admin", "mgr2")

    response = client.delete(f"/api/v1/work-centres/{work_centre.id}/")

    assert response.status_code == 405
