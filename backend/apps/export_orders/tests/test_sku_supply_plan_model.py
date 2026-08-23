import pytest

from apps.customers.models import Customer
from apps.export_orders.models import ExportOrder, ExportOrderLine, SKUSupplyPlan

pytestmark = pytest.mark.django_db


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


def test_str_includes_line(line):
    plan = SKUSupplyPlan.objects.create(export_order_line=line)

    assert str(plan) == f"{line} — supply plan"


def test_required_qty_reads_live_from_line(line):
    plan = SKUSupplyPlan.objects.create(export_order_line=line)

    assert plan.required_qty == 50_000

    line.original_customer_quantity = 60_000
    line.save(update_fields=["original_customer_quantity"])
    plan.refresh_from_db()

    assert plan.required_qty == 60_000


def test_planning_balance_worked_example(line):
    plan = SKUSupplyPlan.objects.create(
        export_order_line=line,
        quantity_from_stock=10_000,
        quantity_to_produce=25_000,
        quantity_to_procure=15_000,
    )

    assert plan.planning_balance == 0


def test_planning_balance_under_planned(line):
    plan = SKUSupplyPlan.objects.create(
        export_order_line=line,
        quantity_from_stock=10_000,
        quantity_to_produce=20_000,
        quantity_to_procure=10_000,
    )

    assert plan.planning_balance == 10_000


def test_planning_balance_over_planned(line):
    plan = SKUSupplyPlan.objects.create(
        export_order_line=line,
        quantity_from_stock=10_000,
        quantity_to_produce=30_000,
        quantity_to_procure=20_000,
    )

    assert plan.planning_balance == -10_000


def test_expected_ready_date_nothing_in_play(line):
    plan = SKUSupplyPlan.objects.create(export_order_line=line, quantity_from_stock=50_000)

    assert plan.overall_sku_expected_ready_date is None


def test_expected_ready_date_produce_without_date(line):
    plan = SKUSupplyPlan.objects.create(export_order_line=line, quantity_to_produce=50_000)

    assert plan.overall_sku_expected_ready_date is None


def test_expected_ready_date_procure_without_date(line):
    plan = SKUSupplyPlan.objects.create(export_order_line=line, quantity_to_procure=50_000)

    assert plan.overall_sku_expected_ready_date is None


def test_expected_ready_date_produce_only(line):
    plan = SKUSupplyPlan.objects.create(
        export_order_line=line,
        quantity_to_produce=50_000,
        production_expected_completion="2026-03-01",
    )

    assert str(plan.overall_sku_expected_ready_date) == "2026-03-01"


def test_expected_ready_date_both_in_play_takes_max(line):
    plan = SKUSupplyPlan.objects.create(
        export_order_line=line,
        quantity_to_produce=25_000,
        production_expected_completion="2026-03-01",
        quantity_to_procure=25_000,
        procurement_expected_receipt="2026-03-15",
    )

    assert str(plan.overall_sku_expected_ready_date) == "2026-03-15"


def test_expected_ready_date_both_in_play_one_missing_is_null(line):
    plan = SKUSupplyPlan.objects.create(
        export_order_line=line,
        quantity_to_produce=25_000,
        production_expected_completion="2026-03-01",
        quantity_to_procure=25_000,
        procurement_expected_receipt=None,
    )

    assert plan.overall_sku_expected_ready_date is None
