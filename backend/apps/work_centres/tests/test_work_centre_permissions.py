import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework.test import APIClient

from apps.work_centres.models import WorkCentre

pytestmark = pytest.mark.django_db

User = get_user_model()

INTERNAL_ROLES = [
    "Export Coordinator",
    "Production Coordinator",
    "Procurement Coordinator",
    "Packing Coordinator",
    "Logistics Coordinator",
    "Manager/Admin",
]
CAN_MANAGE_ROLES = ["Export Coordinator", "Manager/Admin"]
CANNOT_MANAGE_ROLES = [role for role in INTERNAL_ROLES if role not in CAN_MANAGE_ROLES]


def _client_as(role_name: str, username: str) -> APIClient:
    client = APIClient()
    user = User.objects.create_user(username=username, password="x")
    user.groups.add(Group.objects.get(name=role_name))
    client.force_authenticate(user=user)
    return client


@pytest.mark.parametrize("role", INTERNAL_ROLES)
def test_every_internal_role_can_list(role):
    client = _client_as(role, f"list-{role}")

    response = client.get("/api/v1/work-centres/")

    assert response.status_code == 200


def test_customer_role_cannot_list():
    client = _client_as("Customer", "list-customer-role")

    response = client.get("/api/v1/work-centres/")

    assert response.status_code == 403


def test_anonymous_cannot_list():
    client = APIClient()

    response = client.get("/api/v1/work-centres/")

    assert response.status_code == 403


@pytest.mark.parametrize("role", CAN_MANAGE_ROLES)
def test_can_manage_roles_can_create(role):
    client = _client_as(role, f"create-{role}")

    response = client.post(
        "/api/v1/work-centres/",
        {"code": f"NEW-{role}", "name": "Press 01", "type": "MACHINE"},
        format="json",
    )

    assert response.status_code == 201


@pytest.mark.parametrize("role", CANNOT_MANAGE_ROLES)
def test_other_internal_roles_cannot_create(role):
    client = _client_as(role, f"nocreate-{role}")

    response = client.post(
        "/api/v1/work-centres/",
        {"code": f"NC-{role}", "name": "Press 01", "type": "MACHINE"},
        format="json",
    )

    assert response.status_code == 403


@pytest.mark.parametrize("role", CANNOT_MANAGE_ROLES)
def test_other_internal_roles_cannot_update(role, organization):
    work_centre = WorkCentre.objects.create(
        code=f"UPD-{role}", name="Press 01", type=WorkCentre.Type.MACHINE, organization=organization
    )
    client = _client_as(role, f"noupdate-{role}")

    response = client.patch(
        f"/api/v1/work-centres/{work_centre.id}/", {"name": "Renamed"}, format="json"
    )

    assert response.status_code == 403


@pytest.mark.parametrize("role", CANNOT_MANAGE_ROLES)
def test_other_internal_roles_cannot_edit_capabilities(role, organization):
    work_centre = WorkCentre.objects.create(
        code=f"CAP-{role}", name="Press 01", type=WorkCentre.Type.MACHINE, organization=organization
    )
    client = _client_as(role, f"nocap-{role}")

    response = client.patch(
        f"/api/v1/work-centres/{work_centre.id}/capabilities/",
        {"capabilities": []},
        format="json",
    )

    assert response.status_code == 403
