import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework.test import APIClient

from apps.accounts.models import Employee
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
CAN_MANAGE_ROLES = ["Export Coordinator", "Packing Coordinator", "Manager/Admin"]
CANNOT_MANAGE_ROLES = [role for role in INTERNAL_ROLES if role not in CAN_MANAGE_ROLES]


def _client_as(role_name: str, username: str) -> APIClient:
    client = APIClient()
    user = User.objects.create_user(username=username, password="x")
    user.groups.add(Group.objects.get(name=role_name))
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def customer(organization):
    return Customer.objects.create(
        code="CUST-1", name="Acme Exports", organization=organization
    )


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
        original_customer_quantity=100,
        original_customer_unit=ExportOrderLine.Unit.PIECE,
        pieces_per_pouch=1,
        pouches_per_carton=1,
    )


@pytest.fixture
def employee(organization):
    return Employee.objects.create(
        employee_code="EMP-PACK-PERM-1", full_name="Priya K", organization=organization
    )


def _monitor_url(order: ExportOrder) -> str:
    return f"/api/v1/export-orders/{order.id}/packing-monitor/"


def _transactions_url(order: ExportOrder, line: ExportOrderLine) -> str:
    return f"/api/v1/export-orders/{order.id}/lines/{line.id}/packing-transactions/"


def _post_body(employee_id: int) -> dict:
    return {
        "date": "2026-01-05",
        "entry_type": "CARTON_COMPLETED",
        "cartons_packed": 10,
        "packed_by": employee_id,
    }


@pytest.mark.parametrize("role", INTERNAL_ROLES)
def test_every_internal_role_can_view_monitor(role, order, line):
    client = _client_as(role, f"monitor-{role}")

    response = client.get(_monitor_url(order))

    assert response.status_code == 200


@pytest.mark.parametrize("role", INTERNAL_ROLES)
def test_every_internal_role_can_list_transactions(role, order, line):
    client = _client_as(role, f"list-txn-{role}")

    response = client.get(_transactions_url(order, line))

    assert response.status_code == 200


def test_customer_role_cannot_view_monitor(order, line):
    client = _client_as("Customer", "customer-monitor")

    response = client.get(_monitor_url(order))

    assert response.status_code == 403


def test_anonymous_cannot_view_monitor(order, line):
    client = APIClient()

    response = client.get(_monitor_url(order))

    assert response.status_code == 403


@pytest.mark.parametrize("role", CAN_MANAGE_ROLES)
def test_can_manage_roles_can_post_transaction(role, order, line, employee):
    client = _client_as(role, f"post-{role}")

    response = client.post(_transactions_url(order, line), _post_body(employee.id), format="json")

    assert response.status_code == 201


@pytest.mark.parametrize("role", CANNOT_MANAGE_ROLES)
def test_other_internal_roles_cannot_post_transaction(role, order, line, employee):
    client = _client_as(role, f"nopost-{role}")

    response = client.post(_transactions_url(order, line), _post_body(employee.id), format="json")

    assert response.status_code == 403


def test_customer_role_cannot_post_transaction(order, line, employee):
    client = _client_as("Customer", "customer-post")

    response = client.post(_transactions_url(order, line), _post_body(employee.id), format="json")

    assert response.status_code == 403


def test_anonymous_cannot_post_transaction(order, line, employee):
    client = APIClient()

    response = client.post(_transactions_url(order, line), _post_body(employee.id), format="json")

    assert response.status_code == 403
