import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.utils import timezone
from rest_framework.test import APIClient

from apps.customers.models import Customer
from apps.export_orders.models import ExportOrder, ExportOrderLine
from apps.packing.models import (
    PackingIntervalRecord,
    PackingPlanLine,
    PackingRecordingBlock,
    PackingRecordingSchedule,
    PackingRecordingScheduleVersion,
    PackingShift,
    PackingWorkCentreAllocation,
    PackingWorkCentreSession,
    Shift,
)
from apps.packing.services import create_recording_schedule_draft, get_or_create_job_for_plan_line
from apps.processes.models import (
    OutputClassification,
    ProcessCategory,
    ProcessDefinition,
    ProcessDefinitionVersion,
    ProcessOutputDefinition,
)
from apps.work_centres.models import Bay, WorkCentre, WorkCentreType

pytestmark = pytest.mark.django_db

User = get_user_model()


def _manager_client() -> APIClient:
    client = APIClient()
    user = User.objects.create_user(username="mgr", password="x")
    user.groups.add(Group.objects.get(name="Manager/Admin"))
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
        original_customer_quantity=100000,
        original_customer_unit=ExportOrderLine.Unit.PIECE,
        pieces_per_pouch=1,
        pouches_per_carton=1,
    )


@pytest.fixture
def shift(organization):
    return Shift.objects.create(name="Shift 1", code="S1", organization=organization)


@pytest.fixture
def bay(organization):
    return Bay.objects.create(name="Bay 1", code="BAY-1", organization=organization)


@pytest.fixture
def work_centre(organization, bay):
    wc_type, _ = WorkCentreType.objects.get_or_create(
        name="Station", defaults={"organization": organization}
    )
    return WorkCentre.objects.create(
        name="WC-01", code="WC-01", type=wc_type, bay=bay, organization=organization
    )


@pytest.fixture
def other_work_centre(organization, bay):
    wc_type, _ = WorkCentreType.objects.get_or_create(
        name="Station", defaults={"organization": organization}
    )
    return WorkCentre.objects.create(
        name="WC-02", code="WC-02", type=wc_type, bay=bay, organization=organization
    )


@pytest.fixture
def process_version(organization):
    category = ProcessCategory.objects.create(name="Packing", organization=organization)
    definition = ProcessDefinition.objects.create(
        name="Sorting/Cleaning/Packing", code="SCP", organization=organization
    )
    version = ProcessDefinitionVersion.objects.create(
        process_definition=definition, version_number=1, category=category, organization=organization
    )
    for i, name in enumerate(("Good", "Standard", "Reject"), start=1):
        ProcessOutputDefinition.objects.create(
            process_version=version,
            sequence=i,
            item_type=ProcessOutputDefinition.ItemType.MATERIAL,
            uom="PCS",
            classification=OutputClassification.objects.get(name=name),
            organization=organization,
        )
    return version


def _plan_line(line, shift, bay, organization, *, date="2026-09-08", qty=10000, part=1) -> PackingPlanLine:
    return PackingPlanLine.objects.create(
        export_order_line=line,
        date=date,
        shift=shift,
        bay=bay,
        planned_qty=qty,
        status=PackingPlanLine.Status.PLANNED,
        plan_code=f"{line.line_code} Part {part}",
        organization=organization,
    )


def _schedule_with_blocks(shift, organization, *, blocks) -> PackingRecordingScheduleVersion:
    schedule = PackingRecordingSchedule.objects.create(
        name="Standard", shift=shift, organization=organization
    )
    version = create_recording_schedule_draft(schedule)
    for i, (start, end) in enumerate(blocks, start=1):
        PackingRecordingBlock.objects.create(
            version=version, sequence=i, from_time=start, to_time=end, organization=organization
        )
    version.status = PackingRecordingScheduleVersion.Status.ACTIVE
    version.save(update_fields=["status"])
    return version


def _running_allocation(
    organization,
    job,
    bay,
    work_centre,
    process_version,
    *,
    date="2026-09-08",
    started_at=None,
    completed_at=None,
    schedule_version=None,
    shift=None,
) -> PackingWorkCentreAllocation:
    packing_shift, _ = PackingShift.objects.get_or_create(
        date=date,
        shift=shift or job.plan_line.shift,
        organization=organization,
        defaults={"recording_schedule_version": schedule_version},
    )
    session = PackingWorkCentreSession.objects.create(
        packing_shift=packing_shift, work_centre=work_centre, bay=bay, organization=organization
    )
    return PackingWorkCentreAllocation.objects.create(
        session=session,
        job=job,
        sequence=1,
        assigned_qty=5000,
        status=PackingWorkCentreAllocation.Status.RUNNING,
        process_version=process_version,
        started_at=started_at or timezone.now(),
        completed_at=completed_at,
        organization=organization,
    )


class TestRecordSummary:
    def test_summary_only_no_intervals(
        self, organization, line, shift, bay, work_centre, process_version
    ):
        """'Summary only': a WC with no intervals submits one summary."""
        plan_line = _plan_line(line, shift, bay, organization)
        job = get_or_create_job_for_plan_line(plan_line)
        allocation = _running_allocation(organization, job, bay, work_centre, process_version)

        client = _manager_client()
        response = client.post(
            f"/api/v1/packing-allocations/{allocation.id}/summary/",
            {"premium_qty": 4420, "standard_qty": 380, "reject_qty": 200},
            format="json",
        )

        assert response.status_code == 201, response.data
        assert response.data["record_type"] == "SUMMARY"
        assert response.data["covers_unrecorded_only"] is True
        assert response.data["is_final_summary"] is False
        assert PackingIntervalRecord.objects.filter(allocation=allocation).count() == 1
        assert job.packed_qty == 4420

    def test_flexible_mode_interval_then_summary_coexist(
        self, organization, line, shift, bay, work_centre, process_version
    ):
        """'Flexible mode': B1 interval + end summary coexist."""
        version = _schedule_with_blocks(shift, organization, blocks=[("08:30", "10:30")])
        plan_line = _plan_line(line, shift, bay, organization)
        job = get_or_create_job_for_plan_line(plan_line)
        started = timezone.make_aware(timezone.datetime(2026, 9, 8, 8, 30))
        allocation = _running_allocation(
            organization, job, bay, work_centre, process_version,
            started_at=started, schedule_version=version,
        )

        client = _manager_client()
        interval_response = client.post(
            f"/api/v1/packing-allocations/{allocation.id}/interval-records/",
            {"premium_qty": 1000, "standard_qty": 0, "reject_qty": 0},
            format="json",
        )
        assert interval_response.status_code == 201, interval_response.data

        summary_response = client.post(
            f"/api/v1/packing-allocations/{allocation.id}/summary/",
            {"premium_qty": 500, "standard_qty": 0, "reject_qty": 0},
            format="json",
        )
        assert summary_response.status_code == 201, summary_response.data
        assert summary_response.data["record_type"] == "SUMMARY"

        records = PackingIntervalRecord.objects.filter(allocation=allocation)
        assert records.count() == 2
        assert set(records.values_list("record_type", flat=True)) == {"INTERVAL", "SUMMARY"}
        assert job.packed_qty == 1500

    def test_no_double_count_matches_spec_example(
        self, organization, line, shift, bay, work_centre, process_version
    ):
        """spec v5 §8.5: 1,900 interval + 3,100 summary = 5,000 total."""
        version = _schedule_with_blocks(
            shift, organization, blocks=[("08:30", "10:30"), ("10:30", "12:30")]
        )
        plan_line = _plan_line(line, shift, bay, organization)
        job = get_or_create_job_for_plan_line(plan_line)
        started = timezone.make_aware(timezone.datetime(2026, 9, 8, 8, 30))
        allocation = _running_allocation(
            organization, job, bay, work_centre, process_version,
            started_at=started, schedule_version=version,
        )

        client = _manager_client()
        b1 = client.post(
            f"/api/v1/packing-allocations/{allocation.id}/interval-records/",
            {"schedule_block": version.blocks.get(sequence=1).id, "premium_qty": 1000},
            format="json",
        )
        assert b1.status_code == 201, b1.data
        b2 = client.post(
            f"/api/v1/packing-allocations/{allocation.id}/interval-records/",
            {"schedule_block": version.blocks.get(sequence=2).id, "premium_qty": 900},
            format="json",
        )
        assert b2.status_code == 201, b2.data

        summary = client.post(
            f"/api/v1/packing-allocations/{allocation.id}/summary/",
            {"premium_qty": 3100},
            format="json",
        )
        assert summary.status_code == 201, summary.data

        assert job.packed_qty == 5000
        assert allocation.packed_qty == 5000

    def test_final_consolidated_summary_supersedes_earlier_records(
        self, organization, line, shift, bay, work_centre, process_version
    ):
        """A 'final consolidated summary (authorized correction)' replaces
        the allocation's total rather than adding to it."""
        plan_line = _plan_line(line, shift, bay, organization)
        job = get_or_create_job_for_plan_line(plan_line)
        allocation = _running_allocation(organization, job, bay, work_centre, process_version)

        client = _manager_client()
        interval = client.post(
            f"/api/v1/packing-allocations/{allocation.id}/interval-records/",
            {"premium_qty": 1000},
            format="json",
        )
        assert interval.status_code == 201, interval.data
        assert job.packed_qty == 1000

        final = client.post(
            f"/api/v1/packing-allocations/{allocation.id}/summary/",
            {"premium_qty": 4800, "is_final_summary": True},
            format="json",
        )
        assert final.status_code == 201, final.data
        assert final.data["is_final_summary"] is True
        assert final.data["covers_unrecorded_only"] is False

        # The final summary alone is authoritative — not 1000 + 4800.
        assert job.packed_qty == 4800
        assert allocation.packed_qty == 4800

    def test_summary_requires_a_started_allocation(
        self, organization, line, shift, bay, work_centre, process_version
    ):
        plan_line = _plan_line(line, shift, bay, organization)
        job = get_or_create_job_for_plan_line(plan_line)
        allocation = _running_allocation(organization, job, bay, work_centre, process_version)
        allocation.process_version = None
        allocation.save(update_fields=["process_version"])

        client = _manager_client()
        response = client.post(
            f"/api/v1/packing-allocations/{allocation.id}/summary/", {"premium_qty": 100}, format="json"
        )
        assert response.status_code == 400


class TestSummaryInfo:
    def test_entered_and_missing_blocks(
        self, organization, line, shift, bay, work_centre, process_version
    ):
        version = _schedule_with_blocks(
            shift, organization, blocks=[("08:30", "10:30"), ("10:30", "11:30"), ("14:00", "15:00")]
        )
        plan_line = _plan_line(line, shift, bay, organization)
        job = get_or_create_job_for_plan_line(plan_line)
        started = timezone.make_aware(timezone.datetime(2026, 9, 8, 8, 30))
        allocation = _running_allocation(
            organization, job, bay, work_centre, process_version,
            started_at=started, schedule_version=version,
        )

        client = _manager_client()
        client.post(
            f"/api/v1/packing-allocations/{allocation.id}/interval-records/",
            {"schedule_block": version.blocks.get(sequence=1).id, "premium_qty": 100},
            format="json",
        )

        response = client.get(f"/api/v1/packing-allocations/{allocation.id}/summary-info/")
        assert response.status_code == 200, response.data
        assert response.data["entered_blocks"] == ["B1"]
        assert response.data["missing_blocks"] == ["B2", "B3"]

    def test_no_schedule_returns_empty_lists(
        self, organization, line, shift, bay, work_centre, process_version
    ):
        plan_line = _plan_line(line, shift, bay, organization)
        job = get_or_create_job_for_plan_line(plan_line)
        allocation = _running_allocation(organization, job, bay, work_centre, process_version)

        client = _manager_client()
        response = client.get(f"/api/v1/packing-allocations/{allocation.id}/summary-info/")
        assert response.status_code == 200, response.data
        assert response.data == {"entered_blocks": [], "missing_blocks": []}


class TestBulkSummary:
    def test_bulk_summary_saves_multiple_work_centres(
        self, organization, line, shift, bay, work_centre, other_work_centre, process_version
    ):
        plan_line = _plan_line(line, shift, bay, organization)
        job = get_or_create_job_for_plan_line(plan_line)
        alloc1 = _running_allocation(organization, job, bay, work_centre, process_version)
        alloc2 = _running_allocation(organization, job, bay, other_work_centre, process_version)

        client = _manager_client()
        rows_response = client.get(f"/api/v1/packing-jobs/{job.id}/bulk-summary-rows/")
        assert rows_response.status_code == 200, rows_response.data
        assert len(rows_response.data) == 2
        assert {row["mode"] for row in rows_response.data} == {"SUMMARY"}

        save_response = client.post(
            f"/api/v1/packing-jobs/{job.id}/bulk-summaries/",
            {
                "rows": [
                    {"allocation": alloc1.id, "premium_qty": 1820, "standard_qty": 120, "reject_qty": 60},
                    {"allocation": alloc2.id, "premium_qty": 1860, "standard_qty": 90, "reject_qty": 50},
                ]
            },
            format="json",
        )
        assert save_response.status_code == 201, save_response.data
        assert len(save_response.data) == 2
        assert job.packed_qty == 1820 + 1860

    def test_bulk_summary_rejects_allocation_from_another_job(
        self, organization, line, shift, bay, work_centre, process_version
    ):
        plan_line_1 = _plan_line(line, shift, bay, organization, part=1)
        plan_line_2 = _plan_line(line, shift, bay, organization, part=2)
        job1 = get_or_create_job_for_plan_line(plan_line_1)
        job2 = get_or_create_job_for_plan_line(plan_line_2)
        other_alloc = _running_allocation(organization, job2, bay, work_centre, process_version)

        client = _manager_client()
        response = client.post(
            f"/api/v1/packing-jobs/{job1.id}/bulk-summaries/",
            {"rows": [{"allocation": other_alloc.id, "premium_qty": 100}]},
            format="json",
        )
        assert response.status_code == 400
