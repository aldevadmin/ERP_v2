import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework.test import APIClient

from apps.customers.models import Customer
from apps.export_orders.models import ExportOrder

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


@pytest.fixture
def customer(organization):
    return Customer.objects.create(code="CUST-1", name="Acme Exports", organization=organization)


@pytest.mark.parametrize("role", INTERNAL_ROLES)
def test_every_internal_role_can_list(role):
    client = _client_as(role, f"list-{role}")

    response = client.get("/api/v1/export-orders/")

    assert response.status_code == 200


def test_customer_role_cannot_list():
    client = _client_as("Customer", "list-customer-role")

    response = client.get("/api/v1/export-orders/")

    assert response.status_code == 403


def test_anonymous_cannot_list():
    client = APIClient()

    response = client.get("/api/v1/export-orders/")

    assert response.status_code == 403


@pytest.mark.parametrize("role", CAN_MANAGE_ROLES)
def test_can_manage_roles_can_create(role, customer):
    client = _client_as(role, f"create-{role}")

    response = client.post(
        "/api/v1/export-orders/",
        {"customer": customer.id, "customer_po_number": "PO-1", "customer_po_date": "2026-01-01"},
        format="json",
    )

    assert response.status_code == 201


@pytest.mark.parametrize("role", CANNOT_MANAGE_ROLES)
def test_other_internal_roles_cannot_create(role, customer):
    client = _client_as(role, f"nocreate-{role}")

    response = client.post(
        "/api/v1/export-orders/",
        {"customer": customer.id, "customer_po_number": "PO-1", "customer_po_date": "2026-01-01"},
        format="json",
    )

    assert response.status_code == 403


@pytest.mark.parametrize("role", CANNOT_MANAGE_ROLES)
def test_other_internal_roles_cannot_update(role, customer):
    order = ExportOrder.objects.create(
        order_number=f"EO-2026-{role[:4]}",
        customer=customer,
        customer_po_number="PO-1",
        customer_po_date="2026-01-01",
    )
    client = _client_as(role, f"noupdate-{role}")

    response = client.patch(
        f"/api/v1/export-orders/{order.id}/", {"destination_port": "X"}, format="json"
    )

    assert response.status_code == 403


@pytest.mark.parametrize("role", CANNOT_MANAGE_ROLES)
def test_other_internal_roles_cannot_cancel(role, customer):
    order = ExportOrder.objects.create(
        order_number=f"EO-2026-C{role[:3]}",
        customer=customer,
        customer_po_number="PO-1",
        customer_po_date="2026-01-01",
    )
    client = _client_as(role, f"nocancel-{role}")

    response = client.post(f"/api/v1/export-orders/{order.id}/cancel/")

    assert response.status_code == 403


@pytest.mark.parametrize("role", CAN_MANAGE_ROLES)
def test_can_manage_roles_can_advance(role, customer):
    order = ExportOrder.objects.create(
        order_number=f"EO-2026-A{role[:3]}",
        customer=customer,
        customer_po_number="PO-1",
        customer_po_date="2026-01-01",
    )
    client = _client_as(role, f"advance-{role}")

    response = client.post(f"/api/v1/export-orders/{order.id}/advance/")

    assert response.status_code == 200


@pytest.mark.parametrize("role", CANNOT_MANAGE_ROLES)
def test_other_internal_roles_cannot_advance(role, customer):
    order = ExportOrder.objects.create(
        order_number=f"EO-2026-N{role[:3]}",
        customer=customer,
        customer_po_number="PO-1",
        customer_po_date="2026-01-01",
    )
    client = _client_as(role, f"noadvance-{role}")

    response = client.post(f"/api/v1/export-orders/{order.id}/advance/")

    assert response.status_code == 403


@pytest.mark.parametrize("role", INTERNAL_ROLES)
def test_every_internal_role_can_list_and_add_notes(role, customer):
    order = ExportOrder.objects.create(
        order_number=f"EO-2026-{role[:4]}",
        customer=customer,
        customer_po_number="PO-1",
        customer_po_date="2026-01-01",
    )
    client = _client_as(role, f"note-{role}")

    list_response = client.get(f"/api/v1/export-orders/{order.id}/notes/")
    create_response = client.post(
        f"/api/v1/export-orders/{order.id}/notes/", {"text": "Looks fine."}, format="json"
    )

    assert list_response.status_code == 200
    assert create_response.status_code == 201
