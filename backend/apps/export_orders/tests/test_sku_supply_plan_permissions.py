import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework.test import APIClient

from apps.customers.models import Customer
from apps.export_orders.models import ExportOrder, ExportOrderLine

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


@pytest.fixture
def order(customer):
    return ExportOrder.objects.create(
        order_number="EO-2026-0001",
        customer=customer,
        customer_po_number="PO-1",
        customer_po_date="2026-01-01",
    )


@pytest.fixture
def line(order):
    return ExportOrderLine.objects.create(
        export_order=order,
        line_number=1,
        customer_sku_code="SKU-A",
        original_customer_quantity=50_000,
        original_customer_unit=ExportOrderLine.Unit.PIECE,
    )


def _plan_url(order: ExportOrder, line: ExportOrderLine) -> str:
    return f"/api/v1/export-orders/{order.id}/lines/{line.id}/supply-plan/"


def _plans_url(order: ExportOrder) -> str:
    return f"/api/v1/export-orders/{order.id}/supply-plans/"


@pytest.mark.parametrize("role", INTERNAL_ROLES)
def test_every_internal_role_can_get_singleton(role, order, line):
    client = _client_as(role, f"get-{role}")

    response = client.get(_plan_url(order, line))

    assert response.status_code == 200


@pytest.mark.parametrize("role", INTERNAL_ROLES)
def test_every_internal_role_can_list_summary(role, order, line):
    client = _client_as(role, f"list-{role}")

    response = client.get(_plans_url(order))

    assert response.status_code == 200


def test_customer_role_cannot_get_singleton(order, line):
    client = _client_as("Customer", "get-customer-role")

    response = client.get(_plan_url(order, line))

    assert response.status_code == 403


def test_customer_role_cannot_list_summary(order, line):
    client = _client_as("Customer", "list-customer-role")

    response = client.get(_plans_url(order))

    assert response.status_code == 403


def test_anonymous_cannot_get_singleton(order, line):
    client = APIClient()

    response = client.get(_plan_url(order, line))

    assert response.status_code == 403


def test_anonymous_cannot_list_summary(order, line):
    client = APIClient()

    response = client.get(_plans_url(order))

    assert response.status_code == 403


@pytest.mark.parametrize("role", CAN_MANAGE_ROLES)
def test_can_manage_roles_can_patch(role, order, line):
    client = _client_as(role, f"patch-{role}")

    response = client.patch(_plan_url(order, line), {"quantity_from_stock": 50_000}, format="json")

    assert response.status_code == 200


@pytest.mark.parametrize("role", CANNOT_MANAGE_ROLES)
def test_other_internal_roles_cannot_patch(role, order, line):
    client = _client_as(role, f"nopatch-{role}")

    response = client.patch(_plan_url(order, line), {"quantity_from_stock": 50_000}, format="json")

    assert response.status_code == 403


def test_customer_role_cannot_patch(order, line):
    client = _client_as("Customer", "patch-customer-role")

    response = client.patch(_plan_url(order, line), {"quantity_from_stock": 50_000}, format="json")

    assert response.status_code == 403


def test_anonymous_cannot_patch(order, line):
    client = APIClient()

    response = client.patch(_plan_url(order, line), {"quantity_from_stock": 50_000}, format="json")

    assert response.status_code == 403
