import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework.test import APIClient

from apps.customers.models import Customer
from apps.export_orders.models import ExportOrder, ExportOrderLine, SKUSupplyPlan

pytestmark = pytest.mark.django_db

User = get_user_model()


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
        original_customer_quantity=50_000,
        original_customer_unit=ExportOrderLine.Unit.PIECE,
    )


def _plan_url(order: ExportOrder, line: ExportOrderLine) -> str:
    return f"/api/v1/export-orders/{order.id}/lines/{line.id}/supply-plan/"


def _plans_url(order: ExportOrder) -> str:
    return f"/api/v1/export-orders/{order.id}/supply-plans/"


def test_get_returns_virtual_default_when_no_row_exists(order, line):
    client = _client_as("Export Coordinator", "coord1")

    response = client.get(_plan_url(order, line))

    assert response.status_code == 200
    body = response.json()
    assert body["id"] is None
    assert body["required_qty"] == 50_000
    assert body["quantity_from_stock"] == 0
    assert body["planning_balance"] == 50_000
    assert body["planning_status"] == "NOT_STARTED"
    assert not SKUSupplyPlan.objects.filter(export_order_line=line).exists()


def test_patch_creates_row_on_first_save(order, line):
    client = _client_as("Export Coordinator", "coord2")

    response = client.patch(
        _plan_url(order, line),
        {
            "quantity_from_stock": 10_000,
            "quantity_to_produce": 25_000,
            "quantity_to_procure": 15_000,
        },
        format="json",
    )

    assert response.status_code == 200
    assert SKUSupplyPlan.objects.filter(export_order_line=line).exists()
    body = response.json()
    assert body["planning_balance"] == 0


def test_patch_under_planned_without_flag_is_rejected(order, line):
    client = _client_as("Export Coordinator", "coord3")

    response = client.patch(
        _plan_url(order, line),
        {
            "quantity_from_stock": 10_000,
            "quantity_to_produce": 20_000,
            "quantity_to_procure": 10_000,
        },
        format="json",
    )

    assert response.status_code == 400
    assert "planning_balance" in response.json()
    assert not SKUSupplyPlan.objects.filter(export_order_line=line).exists()


def test_patch_under_planned_flagged_without_remarks_is_rejected(order, line):
    client = _client_as("Export Coordinator", "coord4")

    response = client.patch(
        _plan_url(order, line),
        {
            "quantity_from_stock": 10_000,
            "quantity_to_produce": 20_000,
            "quantity_to_procure": 10_000,
            "is_intentionally_underplanned": True,
        },
        format="json",
    )

    assert response.status_code == 400
    assert "remarks" in response.json()


def test_patch_under_planned_flagged_with_remarks_succeeds(order, line):
    client = _client_as("Export Coordinator", "coord5")

    response = client.patch(
        _plan_url(order, line),
        {
            "quantity_from_stock": 10_000,
            "quantity_to_produce": 20_000,
            "quantity_to_procure": 10_000,
            "is_intentionally_underplanned": True,
            "remarks": "Customer agreed to a partial shipment first.",
        },
        format="json",
    )

    assert response.status_code == 200
    assert response.json()["planning_balance"] == 10_000


def test_patch_over_planned_succeeds_without_flag(order, line):
    client = _client_as("Export Coordinator", "coord6")

    response = client.patch(
        _plan_url(order, line),
        {
            "quantity_from_stock": 10_000,
            "quantity_to_produce": 30_000,
            "quantity_to_procure": 20_000,
        },
        format="json",
    )

    assert response.status_code == 200
    assert response.json()["planning_balance"] == -10_000


def test_required_qty_reflects_line_after_edit(order, line):
    client = _client_as("Export Coordinator", "coord7")
    client.patch(
        _plan_url(order, line),
        {"quantity_from_stock": 50_000},
        format="json",
    )

    line.original_customer_quantity = 70_000
    line.save(update_fields=["original_customer_quantity"])

    response = client.get(_plan_url(order, line))

    assert response.json()["required_qty"] == 70_000
    assert response.json()["planning_balance"] == 20_000


def test_list_returns_one_row_per_line_mixed_persisted_and_virtual(customer, order, line):
    ExportOrderLine.objects.create(
        export_order=order,
        line_number=2,
        customer_sku_code="SKU-B",
        original_customer_quantity=1_000,
        original_customer_unit=ExportOrderLine.Unit.PIECE,
    )
    SKUSupplyPlan.objects.create(export_order_line=line, quantity_from_stock=50_000)

    other_order = ExportOrder.objects.create(
        order_number="EO-2026-0002",
        customer=customer,
        customer_po_number="PO-2",
        customer_po_date="2026-01-01",
    )
    ExportOrderLine.objects.create(
        export_order=other_order,
        line_number=1,
        customer_sku_code="SKU-C",
        original_customer_quantity=1,
        original_customer_unit=ExportOrderLine.Unit.PIECE,
    )

    client = _client_as("Export Coordinator", "coord8")

    response = client.get(_plans_url(order))

    body = response.json()
    assert isinstance(body, list)
    assert len(body) == 2
    by_sku = {row["customer_sku_code"]: row for row in body}
    assert by_sku["SKU-A"]["quantity_from_stock"] == 50_000
    assert by_sku["SKU-A"]["planning_balance"] == 0
    assert by_sku["SKU-B"]["id"] is None
    assert by_sku["SKU-B"]["planning_balance"] == 1_000
