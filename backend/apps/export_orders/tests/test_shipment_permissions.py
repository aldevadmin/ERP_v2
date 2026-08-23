import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework.test import APIClient

from apps.customers.models import Customer
from apps.export_orders.models import ExportOrder, ExportOrderLine, Shipment

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
CAN_MANAGE_ROLES = ["Export Coordinator", "Logistics Coordinator", "Manager/Admin"]
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
        original_customer_quantity=1_000,
        original_customer_unit=ExportOrderLine.Unit.PIECE,
    )


@pytest.fixture
def shipment(order):
    return Shipment.objects.create(shipment_number="EO-2026-0001-S01", export_order=order)


def _shipments_url(order: ExportOrder) -> str:
    return f"/api/v1/export-orders/{order.id}/shipments/"


def _lines_url(order: ExportOrder, shipment: Shipment) -> str:
    return f"/api/v1/export-orders/{order.id}/shipments/{shipment.id}/lines/"


def _line_detail_url(order: ExportOrder, shipment: Shipment, line_id: int) -> str:
    return f"/api/v1/export-orders/{order.id}/shipments/{shipment.id}/lines/{line_id}/"


@pytest.mark.parametrize("role", INTERNAL_ROLES)
def test_every_internal_role_can_list_shipments(role, order, shipment):
    client = _client_as(role, f"list-{role}")

    response = client.get(_shipments_url(order))

    assert response.status_code == 200


def test_customer_role_cannot_list_shipments(order, shipment):
    client = _client_as("Customer", "customer-list")

    response = client.get(_shipments_url(order))

    assert response.status_code == 403


def test_anonymous_cannot_list_shipments(order, shipment):
    client = APIClient()

    response = client.get(_shipments_url(order))

    assert response.status_code == 403


@pytest.mark.parametrize("role", CAN_MANAGE_ROLES)
def test_can_manage_roles_can_create_shipment(role, order):
    client = _client_as(role, f"create-{role}")

    response = client.post(_shipments_url(order), {}, format="json")

    assert response.status_code == 201


@pytest.mark.parametrize("role", CANNOT_MANAGE_ROLES)
def test_other_internal_roles_cannot_create_shipment(role, order):
    client = _client_as(role, f"nocreate-{role}")

    response = client.post(_shipments_url(order), {}, format="json")

    assert response.status_code == 403


def test_customer_role_cannot_create_shipment(order):
    client = _client_as("Customer", "customer-create")

    response = client.post(_shipments_url(order), {}, format="json")

    assert response.status_code == 403


@pytest.mark.parametrize("role", CAN_MANAGE_ROLES)
def test_can_manage_roles_can_create_shipment_line(role, order, shipment, line):
    client = _client_as(role, f"line-{role}")

    response = client.post(
        _lines_url(order, shipment),
        {"export_order_line": line.id, "planned_qty": 100},
        format="json",
    )

    assert response.status_code == 201


@pytest.mark.parametrize("role", CANNOT_MANAGE_ROLES)
def test_other_internal_roles_cannot_create_shipment_line(role, order, shipment, line):
    client = _client_as(role, f"noline-{role}")

    response = client.post(
        _lines_url(order, shipment),
        {"export_order_line": line.id, "planned_qty": 100},
        format="json",
    )

    assert response.status_code == 403


@pytest.mark.parametrize("role", CAN_MANAGE_ROLES)
def test_can_manage_roles_can_patch_loading_fields(role, order, shipment, line):
    setup = _client_as("Manager/Admin", f"load-setup-{role}")
    created = setup.post(
        _lines_url(order, shipment),
        {"export_order_line": line.id, "planned_qty": 100},
        format="json",
    )
    client = _client_as(role, f"load-{role}")

    response = client.patch(
        _line_detail_url(order, shipment, created.json()["id"]),
        {"actual_loaded_cartons": 1},
        format="json",
    )

    assert response.status_code == 200


@pytest.mark.parametrize("role", CANNOT_MANAGE_ROLES)
def test_other_internal_roles_cannot_patch_loading_fields(role, order, shipment, line):
    setup = _client_as("Manager/Admin", f"noload-setup-{role}")
    created = setup.post(
        _lines_url(order, shipment),
        {"export_order_line": line.id, "planned_qty": 100},
        format="json",
    )
    client = _client_as(role, f"noload-{role}")

    response = client.patch(
        _line_detail_url(order, shipment, created.json()["id"]),
        {"actual_loaded_cartons": 1},
        format="json",
    )

    assert response.status_code == 403
