import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser, Group
from rest_framework.test import APIRequestFactory

from apps.accounts.permissions import HasAnyRole

pytestmark = pytest.mark.django_db

User = get_user_model()
factory = APIRequestFactory()


def _request_as(user):
    request = factory.get("/")
    request.user = user
    return request


def test_user_in_an_allowed_role_is_permitted():
    user = User.objects.create_user(username="coord", password="x")
    user.groups.add(Group.objects.get(name="Export Coordinator"))
    permission = HasAnyRole("Export Coordinator", "Manager/Admin")()

    assert permission.has_permission(_request_as(user), None) is True


def test_user_in_a_different_role_is_denied():
    user = User.objects.create_user(username="other", password="x")
    user.groups.add(Group.objects.get(name="Packing Coordinator"))
    permission = HasAnyRole("Export Coordinator", "Manager/Admin")()

    assert permission.has_permission(_request_as(user), None) is False


def test_anonymous_user_is_denied():
    permission = HasAnyRole("Export Coordinator")()

    assert permission.has_permission(_request_as(AnonymousUser()), None) is False


def test_seed_migration_creates_exactly_the_seven_roles():
    expected = {
        "Export Coordinator",
        "Production Coordinator",
        "Procurement Coordinator",
        "Packing Coordinator",
        "Logistics Coordinator",
        "Manager/Admin",
        "Customer",
    }

    assert set(Group.objects.values_list("name", flat=True)) == expected


def test_manager_admin_has_master_data_permissions():
    group = Group.objects.get(name="Manager/Admin")
    codenames = set(group.permissions.values_list("codename", flat=True))

    assert {"add_organization", "change_organization", "view_organization"} <= codenames
    assert {"add_team", "change_team", "view_team"} <= codenames
    assert {"add_employee", "change_employee", "view_employee"} <= codenames
