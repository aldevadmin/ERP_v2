import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework.test import APIClient

from apps.customers.models import Customer
from apps.export_orders.models import ExportOrder, ExportOrderLine, SKUSupplyPlan
from apps.vendors.models import Vendor

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
CAN_MANAGE_ROLES = ["Export Coordinator", "Procurement Coordinator", "Manager/Admin"]
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


@pytest.fixture
def vendor(organization):
    return Vendor.objects.create(code="V1", name="Acme Supplies", organization=organization)


@pytest.fixture(autouse=True)
def supply_plan(line):
    return SKUSupplyPlan.objects.create(export_order_line=line, quantity_to_procure=10_000)


def _requirements_url(order: ExportOrder) -> str:
    return f"/api/v1/export-orders/{order.id}/procurement-requirements/"


def _transactions_url(order: ExportOrder, line: ExportOrderLine) -> str:
    return f"/api/v1/export-orders/{order.id}/lines/{line.id}/procurement-transactions/"


def _post_body(vendor: Vendor) -> dict:
    return {
        "date": "2026-01-05",
        "quantity_received": 1_000,
        "quantity_accepted": 900,
        "quantity_rejected": 100,
        "vendor": vendor.id,
        "party_team": "Acme Supplies",
    }


@pytest.mark.parametrize("role", INTERNAL_ROLES)
def test_every_internal_role_can_list_requirements(role, order, line):
    client = _client_as(role, f"list-req-{role}")

    response = client.get(_requirements_url(order))

    assert response.status_code == 200


@pytest.mark.parametrize("role", INTERNAL_ROLES)
def test_every_internal_role_can_list_transactions(role, order, line):
    client = _client_as(role, f"list-txn-{role}")

    response = client.get(_transactions_url(order, line))

    assert response.status_code == 200


def test_customer_role_cannot_list_requirements(order, line):
    client = _client_as("Customer", "customer-list-req")

    response = client.get(_requirements_url(order))

    assert response.status_code == 403


def test_anonymous_cannot_list_requirements(order, line):
    client = APIClient()

    response = client.get(_requirements_url(order))

    assert response.status_code == 403


@pytest.mark.parametrize("role", CAN_MANAGE_ROLES)
def test_can_manage_roles_can_post_transaction(role, order, line, vendor):
    client = _client_as(role, f"post-{role}")

    response = client.post(_transactions_url(order, line), _post_body(vendor), format="json")

    assert response.status_code == 201


@pytest.mark.parametrize("role", CANNOT_MANAGE_ROLES)
def test_other_internal_roles_cannot_post_transaction(role, order, line, vendor):
    client = _client_as(role, f"nopost-{role}")

    response = client.post(_transactions_url(order, line), _post_body(vendor), format="json")

    assert response.status_code == 403


def test_customer_role_cannot_post_transaction(order, line, vendor):
    client = _client_as("Customer", "customer-post")

    response = client.post(_transactions_url(order, line), _post_body(vendor), format="json")

    assert response.status_code == 403


def test_anonymous_cannot_post_transaction(order, line, vendor):
    client = APIClient()

    response = client.post(_transactions_url(order, line), _post_body(vendor), format="json")

    assert response.status_code == 403
