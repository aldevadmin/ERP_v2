import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.accounts.models import Employee

pytestmark = pytest.mark.django_db

User = get_user_model()


@pytest.fixture
def user():
    return User.objects.create_user(username="operator1", password="a-strong-password")


def test_login_with_valid_credentials_returns_user_payload(user):
    client = APIClient()

    response = client.post(
        "/api/v1/auth/login/", {"username": "operator1", "password": "a-strong-password"}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["username"] == "operator1"
    assert body["roles"] == []
    assert body["employee"] is None


def test_login_with_invalid_credentials_is_rejected(user):
    client = APIClient()

    response = client.post(
        "/api/v1/auth/login/", {"username": "operator1", "password": "wrong-password"}
    )

    assert response.status_code == 401


def test_me_requires_authentication():
    client = APIClient()

    response = client.get("/api/v1/auth/me/")

    # DRF's SessionAuthentication has no WWW-Authenticate challenge, so an
    # anonymous request is rejected with 403, not 401 — this is standard
    # DRF behavior for session-only auth, not a bug.
    assert response.status_code == 403


def test_me_returns_current_user_after_login(user):
    client = APIClient()
    client.login(username="operator1", password="a-strong-password")

    response = client.get("/api/v1/auth/me/")

    assert response.status_code == 200
    assert response.json()["username"] == "operator1"


def test_logout_clears_the_session(user):
    client = APIClient()
    client.login(username="operator1", password="a-strong-password")

    logout_response = client.post("/api/v1/auth/logout/")
    me_response = client.get("/api/v1/auth/me/")

    assert logout_response.status_code == 204
    assert me_response.status_code == 403


def test_me_includes_employee_when_linked(user, organization):
    Employee.objects.create(
        user=user,
        employee_code="EMP001",
        full_name="Operator One",
        organization=organization,
    )
    client = APIClient()
    client.login(username="operator1", password="a-strong-password")

    response = client.get("/api/v1/auth/me/")

    employee = response.json()["employee"]
    assert employee["employee_code"] == "EMP001"
    assert employee["organization"]["name"] == organization.name
