import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.vendors.models import Vendor

pytestmark = pytest.mark.django_db

User = get_user_model()


def _authenticated_client():
    client = APIClient()
    user = User.objects.create_user(username="anyuser", password="x")
    client.force_authenticate(user=user)
    return client


def test_vendors_requires_authentication():
    client = APIClient()

    response = client.get("/api/v1/vendors/")

    assert response.status_code == 403


def test_vendors_lists_only_active_vendors(organization):
    Vendor.objects.create(code="V1", name="Acme Supplies", organization=organization)
    Vendor.objects.create(
        code="V2", name="Retired Co", organization=organization, is_active=False
    )
    client = _authenticated_client()

    response = client.get("/api/v1/vendors/")

    names = [vendor["name"] for vendor in response.json()["results"]]
    assert response.status_code == 200
    assert "Acme Supplies" in names
    assert "Retired Co" not in names


def test_vendors_search_by_name(organization):
    Vendor.objects.create(code="V1", name="Acme Supplies", organization=organization)
    Vendor.objects.create(code="V2", name="Other Traders", organization=organization)
    client = _authenticated_client()

    response = client.get("/api/v1/vendors/?search=Acme")

    results = response.json()["results"]
    assert len(results) == 1
    assert results[0]["name"] == "Acme Supplies"
