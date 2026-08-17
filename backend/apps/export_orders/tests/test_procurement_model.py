import pytest

from apps.customers.models import Customer
from apps.export_orders.models import (
    ExportOrder,
    ExportOrderLine,
    ProcurementRequirement,
    ProcurementTransaction,
    SKUSupplyPlan,
)
from apps.vendors.models import Vendor

pytestmark = pytest.mark.django_db


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


@pytest.fixture
def vendor(organization):
    return Vendor.objects.create(code="V1", name="Acme Supplies", organization=organization)


def _add_transaction(requirement, vendor, **kwargs):
    defaults = {
        "date": "2026-01-05",
        "quantity_received": 0,
        "quantity_accepted": 0,
        "quantity_rejected": 0,
    }
    defaults.update(kwargs)
    return ProcurementTransaction.objects.create(
        procurement_requirement=requirement, vendor=vendor, **defaults
    )


def test_str_includes_line(line):
    requirement = ProcurementRequirement.objects.create(export_order_line=line)

    assert str(requirement) == f"{line} — procurement requirement"


def test_planned_qty_reads_live_from_supply_plan(line):
    requirement = ProcurementRequirement.objects.create(export_order_line=line)

    assert requirement.planned_qty == 0

    SKUSupplyPlan.objects.create(export_order_line=line, quantity_to_procure=15_000)
    requirement.refresh_from_db()

    assert requirement.planned_qty == 15_000


def test_worked_example_regression(line, vendor):
    """CLAUDE.md / business-rules.md §5 golden rule: only Accepted feeds
    availability. Planned 15,000; Received 15,000; Accepted 14,200;
    Rejected 800 -> Available 14,200 / Balance 800 / not Ready.
    """
    SKUSupplyPlan.objects.create(export_order_line=line, quantity_to_procure=15_000)
    requirement = ProcurementRequirement.objects.create(export_order_line=line)
    _add_transaction(
        requirement, vendor, quantity_received=15_000, quantity_accepted=14_200,
        quantity_rejected=800,
    )

    assert requirement.cumulative_received == 15_000
    assert requirement.cumulative_accepted == 14_200
    assert requirement.cumulative_rejected == 800
    assert requirement.balance == 800
    assert requirement.status != SKUSupplyPlan.PlanningStatus.READY


def test_multiple_transactions_sum_correctly(line, vendor):
    SKUSupplyPlan.objects.create(export_order_line=line, quantity_to_procure=10_000)
    requirement = ProcurementRequirement.objects.create(export_order_line=line)
    _add_transaction(
        requirement, vendor, date="2026-01-05", quantity_received=4_000,
        quantity_accepted=3_500, quantity_rejected=500,
    )
    _add_transaction(
        requirement, vendor, date="2026-01-06", quantity_received=4_000,
        quantity_accepted=3_800, quantity_rejected=200,
    )

    assert requirement.cumulative_received == 8_000
    assert requirement.cumulative_accepted == 7_300
    assert requirement.cumulative_rejected == 700


def test_status_not_started_with_no_transactions(line):
    SKUSupplyPlan.objects.create(export_order_line=line, quantity_to_procure=10_000)
    requirement = ProcurementRequirement.objects.create(export_order_line=line)

    assert requirement.status == SKUSupplyPlan.PlanningStatus.NOT_STARTED


def test_status_in_progress_once_transaction_exists_and_not_ready(line, vendor):
    SKUSupplyPlan.objects.create(export_order_line=line, quantity_to_procure=10_000)
    requirement = ProcurementRequirement.objects.create(export_order_line=line)
    _add_transaction(requirement, vendor, quantity_received=1_000, quantity_accepted=900)

    assert requirement.status == SKUSupplyPlan.PlanningStatus.IN_PROGRESS


def test_status_ready_when_accepted_meets_planned(line, vendor):
    SKUSupplyPlan.objects.create(export_order_line=line, quantity_to_procure=10_000)
    requirement = ProcurementRequirement.objects.create(export_order_line=line)
    _add_transaction(requirement, vendor, quantity_received=10_000, quantity_accepted=10_000)

    assert requirement.status == SKUSupplyPlan.PlanningStatus.READY


def test_status_ready_when_accepted_exceeds_planned(line, vendor):
    SKUSupplyPlan.objects.create(export_order_line=line, quantity_to_procure=10_000)
    requirement = ProcurementRequirement.objects.create(export_order_line=line)
    _add_transaction(requirement, vendor, quantity_received=11_000, quantity_accepted=10_500)

    assert requirement.status == SKUSupplyPlan.PlanningStatus.READY
    assert requirement.balance == -500


def test_status_delayed_only_after_expected_receipt_has_passed(line, vendor):
    SKUSupplyPlan.objects.create(
        export_order_line=line,
        quantity_to_procure=10_000,
        procurement_expected_receipt="2020-01-01",
    )
    line.refresh_from_db()  # force a real date, not the assigned string, on supply_plan
    requirement = ProcurementRequirement.objects.create(export_order_line=line)
    _add_transaction(requirement, vendor, quantity_received=1_000, quantity_accepted=900)

    assert requirement.status == SKUSupplyPlan.PlanningStatus.DELAYED


def test_status_in_progress_when_expected_receipt_in_future(line, vendor):
    SKUSupplyPlan.objects.create(
        export_order_line=line,
        quantity_to_procure=10_000,
        procurement_expected_receipt="2099-01-01",
    )
    line.refresh_from_db()  # force a real date, not the assigned string, on supply_plan
    requirement = ProcurementRequirement.objects.create(export_order_line=line)
    _add_transaction(requirement, vendor, quantity_received=1_000, quantity_accepted=900)

    assert requirement.status == SKUSupplyPlan.PlanningStatus.IN_PROGRESS


def test_progress_is_none_when_nothing_planned(line, vendor):
    requirement = ProcurementRequirement.objects.create(export_order_line=line)
    _add_transaction(requirement, vendor, quantity_received=100, quantity_accepted=100)

    assert requirement.progress is None


def test_last_transaction_at_is_none_with_no_transactions(line):
    requirement = ProcurementRequirement.objects.create(export_order_line=line)

    assert requirement.last_transaction_at is None


def test_last_transaction_at_is_most_recent_transaction(line, vendor):
    requirement = ProcurementRequirement.objects.create(export_order_line=line)
    first = _add_transaction(requirement, vendor, date="2026-01-05")
    second = _add_transaction(requirement, vendor, date="2026-01-06")

    assert requirement.last_transaction_at == second.created_at
    assert requirement.last_transaction_at >= first.created_at
