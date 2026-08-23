import pytest

from apps.customers.models import Customer
from apps.export_orders.models import (
    ExportOrder,
    ExportOrderLine,
    ProductionRequirement,
    ProductionTransaction,
    SKUSupplyPlan,
)

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


def _add_transaction(requirement, **kwargs):
    defaults = {
        "date": "2026-01-05",
        "quantity_produced": 0,
        "quantity_accepted": 0,
        "quantity_rejected": 0,
    }
    defaults.update(kwargs)
    return ProductionTransaction.objects.create(production_requirement=requirement, **defaults)


def test_str_includes_line(line):
    requirement = ProductionRequirement.objects.create(export_order_line=line)

    assert str(requirement) == f"{line} — production requirement"


def test_planned_qty_reads_live_from_supply_plan(line):
    requirement = ProductionRequirement.objects.create(export_order_line=line)

    assert requirement.planned_qty == 0

    SKUSupplyPlan.objects.create(export_order_line=line, quantity_to_produce=25_000)
    requirement.refresh_from_db()

    assert requirement.planned_qty == 25_000


def test_worked_example_regression(line):
    """CLAUDE.md / business-rules.md §4 golden rule: only Accepted feeds
    availability. Planned 25,000; Produced 26,000; Accepted 23,000;
    Rejected 3,000 -> Available 23,000 / Progress 92% / Balance 2,000 /
    not Ready.
    """
    SKUSupplyPlan.objects.create(export_order_line=line, quantity_to_produce=25_000)
    requirement = ProductionRequirement.objects.create(export_order_line=line)
    _add_transaction(
        requirement, quantity_produced=26_000, quantity_accepted=23_000, quantity_rejected=3_000
    )

    assert requirement.cumulative_produced == 26_000
    assert requirement.cumulative_accepted == 23_000
    assert requirement.cumulative_rejected == 3_000
    assert requirement.progress == pytest.approx(0.92)
    assert requirement.balance == 2_000
    assert requirement.status != SKUSupplyPlan.PlanningStatus.READY


def test_multiple_transactions_sum_correctly(line):
    SKUSupplyPlan.objects.create(export_order_line=line, quantity_to_produce=10_000)
    requirement = ProductionRequirement.objects.create(export_order_line=line)
    _add_transaction(
        requirement,
        date="2026-01-05",
        quantity_produced=4_000,
        quantity_accepted=3_500,
        quantity_rejected=500,
    )
    _add_transaction(
        requirement,
        date="2026-01-06",
        quantity_produced=4_000,
        quantity_accepted=3_800,
        quantity_rejected=200,
    )

    assert requirement.cumulative_produced == 8_000
    assert requirement.cumulative_accepted == 7_300
    assert requirement.cumulative_rejected == 700


def test_status_not_started_with_no_transactions(line):
    SKUSupplyPlan.objects.create(export_order_line=line, quantity_to_produce=10_000)
    requirement = ProductionRequirement.objects.create(export_order_line=line)

    assert requirement.status == SKUSupplyPlan.PlanningStatus.NOT_STARTED


def test_status_in_progress_once_transaction_exists_and_not_ready(line):
    SKUSupplyPlan.objects.create(export_order_line=line, quantity_to_produce=10_000)
    requirement = ProductionRequirement.objects.create(export_order_line=line)
    _add_transaction(requirement, quantity_produced=1_000, quantity_accepted=900)

    assert requirement.status == SKUSupplyPlan.PlanningStatus.IN_PROGRESS


def test_status_ready_when_accepted_meets_planned(line):
    SKUSupplyPlan.objects.create(export_order_line=line, quantity_to_produce=10_000)
    requirement = ProductionRequirement.objects.create(export_order_line=line)
    _add_transaction(requirement, quantity_produced=10_000, quantity_accepted=10_000)

    assert requirement.status == SKUSupplyPlan.PlanningStatus.READY


def test_status_ready_when_accepted_exceeds_planned(line):
    SKUSupplyPlan.objects.create(export_order_line=line, quantity_to_produce=10_000)
    requirement = ProductionRequirement.objects.create(export_order_line=line)
    _add_transaction(requirement, quantity_produced=11_000, quantity_accepted=10_500)

    assert requirement.status == SKUSupplyPlan.PlanningStatus.READY
    assert requirement.balance == -500


def test_status_delayed_only_after_expected_completion_has_passed(line):
    SKUSupplyPlan.objects.create(
        export_order_line=line,
        quantity_to_produce=10_000,
        production_expected_completion="2020-01-01",
    )
    line.refresh_from_db()  # force a real date, not the assigned string, on supply_plan
    requirement = ProductionRequirement.objects.create(export_order_line=line)
    _add_transaction(requirement, quantity_produced=1_000, quantity_accepted=900)

    assert requirement.status == SKUSupplyPlan.PlanningStatus.DELAYED


def test_status_in_progress_when_expected_completion_in_future(line):
    SKUSupplyPlan.objects.create(
        export_order_line=line,
        quantity_to_produce=10_000,
        production_expected_completion="2099-01-01",
    )
    line.refresh_from_db()  # force a real date, not the assigned string, on supply_plan
    requirement = ProductionRequirement.objects.create(export_order_line=line)
    _add_transaction(requirement, quantity_produced=1_000, quantity_accepted=900)

    assert requirement.status == SKUSupplyPlan.PlanningStatus.IN_PROGRESS


def test_progress_is_none_when_nothing_planned(line):
    requirement = ProductionRequirement.objects.create(export_order_line=line)
    _add_transaction(requirement, quantity_produced=100, quantity_accepted=100)

    assert requirement.progress is None


def test_last_transaction_at_is_none_with_no_transactions(line):
    requirement = ProductionRequirement.objects.create(export_order_line=line)

    assert requirement.last_transaction_at is None


def test_last_transaction_at_is_most_recent_transaction(line):
    requirement = ProductionRequirement.objects.create(export_order_line=line)
    first = _add_transaction(requirement, date="2026-01-05")
    second = _add_transaction(requirement, date="2026-01-06")

    assert requirement.last_transaction_at == second.created_at
    assert requirement.last_transaction_at >= first.created_at
