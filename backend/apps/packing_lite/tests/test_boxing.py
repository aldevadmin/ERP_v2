import pytest
from django.utils import timezone

from apps.customers.models import Customer
from apps.export_orders.models import ExportOrder, ExportOrderLine, PackingTransaction
from apps.packing_lite.models import BoxingRecord, PackingAllotment, PackingDayClosure, WorkCentreRecord
from apps.packing_lite.services import (
    boxing_summary_for_allotment,
    close_pending_day,
    record_boxing_output,
)
from apps.processes.models import (
    OutputClassification,
    ProcessCategory,
    ProcessDefinition,
    ProcessDefinitionVersion,
    ProcessExecution,
    ProcessInputDefinition,
    ProcessOutputDefinition,
)
from apps.work_centres.models import WorkCentre, WorkCentreProcessCapability, WorkCentreType

pytestmark = pytest.mark.django_db


@pytest.fixture
def customer(organization):
    return Customer.objects.create(code="CUST-1", name="Acme Exports", organization=organization)


@pytest.fixture
def line(customer):
    order = ExportOrder.objects.create(
        order_number="EO-2026-0001",
        customer=customer,
        customer_po_number="PO-1",
        customer_po_date="2026-01-01",
    )
    return ExportOrderLine.objects.create(
        export_order=order,
        line_number=1,
        customer_sku_code="SKU-A",
        original_customer_quantity=100000,
        original_customer_unit=ExportOrderLine.Unit.PIECE,
        pieces_per_pouch=1,
        pouches_per_carton=10,
    )


@pytest.fixture
def allotment(line, organization):
    return PackingAllotment.objects.create(
        export_order_line=line,
        date=timezone.localdate(),
        allotted_cartons=5,
        status=PackingAllotment.Status.RELEASED,
        released_at=timezone.now(),
        organization=organization,
    )


@pytest.fixture
def boxing_work_centre(organization):
    wc_type, _ = WorkCentreType.objects.get_or_create(
        name="Station", defaults={"organization": organization}
    )
    work_centre = WorkCentre.objects.create(
        code="WC-BOX-1", name="Boxing Station", type=wc_type, organization=organization
    )
    category = ProcessCategory.objects.create(name="Boxing", organization=organization)
    definition = ProcessDefinition.objects.create(
        name="Boxing", code="BOXING", organization=organization
    )
    version = ProcessDefinitionVersion.objects.create(
        process_definition=definition, version_number=1, category=category, organization=organization
    )
    ProcessInputDefinition.objects.create(
        process_version=version,
        sequence=1,
        input_type=ProcessInputDefinition.InputType.WIP,
        uom="PCS",
        organization=organization,
    )
    ProcessOutputDefinition.objects.create(
        process_version=version,
        sequence=1,
        item_type=ProcessOutputDefinition.ItemType.PRODUCT,
        uom="PCS",
        classification=OutputClassification.objects.get(name="Good"),
        organization=organization,
    )
    WorkCentreProcessCapability.objects.create(
        work_centre=work_centre, process_definition=definition, organization=organization
    )
    return work_centre


def _add_pouches_packed(allotment: PackingAllotment, quantity: int) -> WorkCentreRecord:
    """A minimal `WorkCentreRecord` for reconciliation tests — only
    `pouches_packed` matters here, so the execution it wraps is a bare
    stand-in, not a realistic plate-packing one.
    """
    category = ProcessCategory.objects.create(
        name=f"Packing-{quantity}", organization=allotment.organization
    )
    definition = ProcessDefinition.objects.create(
        name=f"Packing-{quantity}", code=f"PACK-{quantity}", organization=allotment.organization
    )
    version = ProcessDefinitionVersion.objects.create(
        process_definition=definition,
        version_number=1,
        category=category,
        organization=allotment.organization,
    )
    execution = ProcessExecution.objects.create(
        process_version=version, date=timezone.localdate(), organization=allotment.organization
    )
    return WorkCentreRecord.objects.create(
        allotment=allotment,
        execution=execution,
        pouches_packed=quantity,
        organization=allotment.organization,
    )


class TestRecordBoxingOutput:
    def test_creates_record_wrapping_a_real_execution(self, allotment, boxing_work_centre):
        record = record_boxing_output(
            allotment=allotment,
            work_centre=boxing_work_centre,
            boxes_packed=8,
            employee_ids=[],
            user=None,
        )

        assert isinstance(record, BoxingRecord)
        assert record.execution.total_output_quantity == 8
        assert record.execution.work_centre == boxing_work_centre
        assert record.execution.export_order_line == allotment.export_order_line

    def test_rejects_zero_quantity(self, allotment, boxing_work_centre):
        with pytest.raises(ValueError, match="greater than zero"):
            record_boxing_output(
                allotment=allotment,
                work_centre=boxing_work_centre,
                boxes_packed=0,
                employee_ids=[],
                user=None,
            )

    def test_blocked_once_the_date_is_closed(self, allotment, boxing_work_centre):
        PackingDayClosure.objects.create(date=allotment.date, organization=allotment.organization)

        with pytest.raises(ValueError, match="already closed"):
            record_boxing_output(
                allotment=allotment,
                work_centre=boxing_work_centre,
                boxes_packed=8,
                employee_ids=[],
                user=None,
            )

    def test_requires_a_configured_process(self, allotment, organization):
        wc_type, _ = WorkCentreType.objects.get_or_create(
            name="Station", defaults={"organization": organization}
        )
        unconfigured = WorkCentre.objects.create(
            code="WC-BOX-2", name="Unconfigured", type=wc_type, organization=organization
        )

        with pytest.raises(ValueError, match="no process configured"):
            record_boxing_output(
                allotment=allotment,
                work_centre=unconfigured,
                boxes_packed=8,
                employee_ids=[],
                user=None,
            )


class TestBoxingSummaryForAllotment:
    def test_flags_a_shortfall_against_pouches_per_carton(self, allotment, boxing_work_centre):
        _add_pouches_packed(allotment, 100)  # pouches_per_carton=10 -> expects 10 cartons
        record_boxing_output(
            allotment=allotment, work_centre=boxing_work_centre, boxes_packed=8,
            employee_ids=[], user=None,
        )

        summary = boxing_summary_for_allotment(allotment)

        assert summary == {
            "pouches_packed": 100,
            "boxes_packed": 8,
            "expected_boxes": 10,
            "boxing_discrepancy": -2,
        }

    def test_none_when_the_line_has_no_pouches_per_carton(self, allotment, boxing_work_centre):
        allotment.export_order_line.pouches_per_carton = None
        allotment.export_order_line.save(update_fields=["pouches_per_carton"])
        _add_pouches_packed(allotment, 100)

        summary = boxing_summary_for_allotment(allotment)

        assert summary["expected_boxes"] is None
        assert summary["boxing_discrepancy"] is None


class TestClosePendingDaySnapshotsBoxingReconciliation:
    def test_snapshot_captures_the_discrepancy(self, allotment, boxing_work_centre):
        _add_pouches_packed(allotment, 100)
        record_boxing_output(
            allotment=allotment, work_centre=boxing_work_centre, boxes_packed=8,
            employee_ids=[], user=None,
        )

        closure = close_pending_day(user=None)

        assert closure.date == allotment.date
        assert len(closure.boxing_reconciliation) == 1
        row = closure.boxing_reconciliation[0]
        assert row["allotment_id"] == allotment.id
        assert row["order_no"] == allotment.export_order_line.export_order.order_number
        assert row["customer_sku_code"] == "SKU-A"
        assert row["pouches_packed"] == 100
        assert row["boxes_packed"] == 8
        assert row["expected_boxes"] == 10
        assert row["boxing_discrepancy"] == -2

    def test_does_not_block_closing_when_nothing_was_boxed(self, allotment):
        _add_pouches_packed(allotment, 100)

        closure = close_pending_day(user=None)

        row = closure.boxing_reconciliation[0]
        assert row["boxes_packed"] == 0
        assert row["boxing_discrepancy"] == -10


class TestClosePendingDayPostsPackingTransactions:
    def test_posts_a_carton_completed_transaction_for_boxes_packed(
        self, allotment, boxing_work_centre
    ):
        record_boxing_output(
            allotment=allotment, work_centre=boxing_work_centre, boxes_packed=8,
            employee_ids=[], user=None,
        )

        close_pending_day(user=None)

        transactions = list(allotment.export_order_line.packing_transactions.all())
        assert len(transactions) == 1
        txn = transactions[0]
        assert txn.entry_type == PackingTransaction.EntryType.CARTON_COMPLETED
        assert txn.cartons_packed == 8
        assert txn.date == allotment.date
        assert allotment.export_order_line.packed_cartons == 8

    def test_posts_nothing_when_no_boxes_were_recorded(self, allotment):
        _add_pouches_packed(allotment, 100)

        close_pending_day(user=None)

        assert allotment.export_order_line.packing_transactions.count() == 0
        assert allotment.export_order_line.packed_cartons == 0

    def test_never_posts_from_plate_or_pouch_output_alone(self, allotment):
        """Plate/pouch output never becomes a completed carton on its
        own — only a real Boxing record does (see the service docstring).
        """
        _add_pouches_packed(allotment, 500)

        close_pending_day(user=None)

        assert allotment.export_order_line.packing_transactions.count() == 0

    def test_separate_allotments_post_separate_transactions(
        self, line, organization, boxing_work_centre
    ):
        first = PackingAllotment.objects.create(
            export_order_line=line,
            date=timezone.localdate(),
            allotted_cartons=5,
            status=PackingAllotment.Status.RELEASED,
            released_at=timezone.now(),
            organization=organization,
        )
        second = PackingAllotment.objects.create(
            export_order_line=line,
            date=timezone.localdate(),
            allotted_cartons=5,
            status=PackingAllotment.Status.RELEASED,
            released_at=timezone.now(),
            organization=organization,
        )
        record_boxing_output(
            allotment=first, work_centre=boxing_work_centre, boxes_packed=3,
            employee_ids=[], user=None,
        )
        record_boxing_output(
            allotment=second, work_centre=boxing_work_centre, boxes_packed=4,
            employee_ids=[], user=None,
        )

        close_pending_day(user=None)

        cartons = sorted(
            line.packing_transactions.values_list("cartons_packed", flat=True)
        )
        assert cartons == [3, 4]
        assert line.packed_cartons == 7
