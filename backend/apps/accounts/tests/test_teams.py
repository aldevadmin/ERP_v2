import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.accounts.models import Employee, Team

pytestmark = pytest.mark.django_db

User = get_user_model()


def _authenticated_client():
    client = APIClient()
    user = User.objects.create_user(username="anyuser", password="x")
    client.force_authenticate(user=user)
    return client


def test_teams_requires_authentication():
    client = APIClient()

    response = client.get("/api/v1/teams/")

    assert response.status_code == 403


def test_teams_lists_only_active_teams(organization):
    Team.objects.create(name="Export", organization=organization)
    Team.objects.create(name="Retired", organization=organization, is_active=False)
    client = _authenticated_client()

    response = client.get("/api/v1/teams/")

    names = [team["name"] for team in response.json()["results"]]
    assert response.status_code == 200
    assert "Export" in names
    assert "Retired" not in names


def test_employees_requires_authentication():
    client = APIClient()

    response = client.get("/api/v1/employees/")

    assert response.status_code == 403


def test_employees_search_by_name(organization):
    Employee.objects.create(employee_code="E1", full_name="Asha Rao", organization=organization)
    Employee.objects.create(employee_code="E2", full_name="Vikram Shah", organization=organization)
    client = _authenticated_client()

    response = client.get("/api/v1/employees/?search=Asha")

    results = response.json()["results"]
    assert len(results) == 1
    assert results[0]["full_name"] == "Asha Rao"
