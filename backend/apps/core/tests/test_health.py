import pytest
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db


def test_health_endpoint_returns_ok():
    client = APIClient()

    response = client.get("/api/v1/health/")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "erp-backend"
    assert body["database"] == "ok"
