import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework.test import APIClient

from apps.accounts.models import Employee
from apps.customers.models import Customer, CustomerAddress

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

    response = client.get("/api/v1/customers/")

    assert response.status_code == 403


def test_list_returns_customers(organization):
    Customer.objects.create(code="C1", name="Acme", organization=organization)
    client = _client_as("Export Coordinator", "coord1")

    response = client.get("/api/v1/customers/")

    assert response.status_code == 200
    assert response.json()["results"][0]["code"] == "C1"


def test_create_customer_with_addresses(organization):
    employee = Employee.objects.create(
        employee_code="E1", full_name="Asha Rao", organization=organization
    )
    client = _client_as("Export Coordinator", "coord2")
    payload = {
        "code": "C2",
        "name": "Globex",
        "main_poc": "Jane Doe",
        "emails": ["ops@globex.com", "billing@globex.com"],
        "phone_numbers": ["+1-555-1000", "+1-555-2000"],
        "internal_coordinator": employee.id,
        "is_active": True,
        "addresses": [
            {
                "address_type": "BILLING",
                "country": "USA",
                "state": "New York",
                "line1": "1 Main St",
                "line2": "Suite 2",
                "line3": "Floor 3",
                "pin": "91000",
            },
            {
                "address_type": "BILLING_AND_SHIPPING",
                "country": "USA",
                "state": "New York",
                "line1": "2 Main St",
                "pin": "91001",
            },
        ],
    }

    response = client.post("/api/v1/customers/", payload, format="json")

    assert response.status_code == 201, response.json()
    body = response.json()
    assert body["main_poc"] == "Jane Doe"
    assert body["emails"] == ["ops@globex.com", "billing@globex.com"]
    assert body["phone_numbers"] == ["+1-555-1000", "+1-555-2000"]
    assert body["internal_coordinator_detail"]["full_name"] == "Asha Rao"
    assert len(body["addresses"]) == 2
    customer = Customer.objects.get(code="C2")
    assert customer.addresses.count() == 2
    assert customer.organization_id is not None  # auto-defaulted, never sent by the client


def test_create_rejects_invalid_email(organization):
    client = _client_as("Export Coordinator", "coord3")

    response = client.post(
        "/api/v1/customers/",
        {"code": "C3", "name": "Acme", "emails": ["not-an-email"]},
        format="json",
    )

    assert response.status_code == 400


def test_create_rejects_duplicate_code(organization):
    Customer.objects.create(code="C4", name="Acme", organization=organization)
    client = _client_as("Export Coordinator", "coord4")

    response = client.post(
        "/api/v1/customers/", {"code": "C4", "name": "Dup"}, format="json"
    )

    assert response.status_code == 400


def test_update_upserts_and_removes_addresses(organization):
    customer = Customer.objects.create(code="C5", name="Acme", organization=organization)
    keep = CustomerAddress.objects.create(
        customer=customer,
        address_type=CustomerAddress.AddressType.BILLING,
        country="USA",
        line1="Old",
    )
    to_remove = CustomerAddress.objects.create(
        customer=customer,
        address_type=CustomerAddress.AddressType.SHIPPING,
        country="USA",
        line1="Bye",
    )
    client = _client_as("Manager/Admin", "mgr1")

    response = client.patch(
        f"/api/v1/customers/{customer.id}/",
        {
            "addresses": [
                {
                    "id": keep.id,
                    "address_type": "BILLING",
                    "country": "USA",
                    "line1": "New Line",
                },
                {
                    "address_type": "BILLING_AND_SHIPPING",
                    "country": "USA",
                    "line1": "New Address",
                },
            ]
        },
        format="json",
    )

    assert response.status_code == 200
    keep.refresh_from_db()
    assert keep.line1 == "New Line"
    assert not CustomerAddress.objects.filter(id=to_remove.id).exists()
    assert customer.addresses.count() == 2


def test_search_by_code_or_name(organization):
    Customer.objects.create(code="ABC", name="Foo", organization=organization)
    Customer.objects.create(code="XYZ", name="Bar", organization=organization)
    client = _client_as("Export Coordinator", "coord5")

    response = client.get("/api/v1/customers/?search=Foo")

    results = response.json()["results"]
    assert len(results) == 1
    assert results[0]["code"] == "ABC"


def test_filter_by_is_active(organization):
    Customer.objects.create(
        code="ACT", name="Active Co", organization=organization, is_active=True
    )
    Customer.objects.create(
        code="INA", name="Inactive Co", organization=organization, is_active=False
    )
    client = _client_as("Export Coordinator", "coord6")

    response = client.get("/api/v1/customers/?is_active=false")

    codes = [c["code"] for c in response.json()["results"]]
    assert codes == ["INA"]


def test_no_delete_route(organization):
    customer = Customer.objects.create(code="C6", name="Acme", organization=organization)
    client = _client_as("Manager/Admin", "mgr2")

    response = client.delete(f"/api/v1/customers/{customer.id}/")

    assert response.status_code == 405
