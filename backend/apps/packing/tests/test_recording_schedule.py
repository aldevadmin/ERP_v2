from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.utils import timezone
from rest_framework.test import APIClient

from apps.customers.models import Customer
from apps.export_orders.models import ExportOrder, ExportOrderLine
from apps.packing.models import (
    PackingIntervalRecord,
    PackingJob,
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
from apps.processes.models import ProcessCategory, ProcessDefinition, ProcessDefinitionVersion
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
def process_version(organization):
    category = ProcessCategory.objects.create(name="Packing", organization=organization)
    definition = ProcessDefinition.objects.create(
        name="Sorting/Cleaning/Packing", code="SCP", organization=organization
    )
    return ProcessDefinitionVersion.objects.create(
        process_definition=definition, version_number=1, category=category, organization=organization
    )


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
    """`blocks` is a list of (from_time, to_time) strings, e.g. ('08:30', '10:30')."""
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
) -> PackingWorkCentreAllocation:
    packing_shift = PackingShift.objects.create(
        date=date,
        shift=job.plan_line.shift,
        organization=organization,
        recording_schedule_version=schedule_version,
    )
    session = PackingWorkCentreSession.objects.create(
        packing_shift=packing_shift, work_centre=work_centre, bay=bay, organization=organization
    )
    return PackingWorkCentreAllocation.objects.create(
        session=session,
        job=job,
        sequence=1,
        assigned_qty=1000,
        status=PackingWorkCentreAllocation.Status.RUNNING,
        process_version=process_version,
        started_at=started_at,
        completed_at=completed_at,
        organization=organization,
    )


class TestScheduleLifecycle:
    def test_create_auto_creates_a_draft_version(self, organization, shift):
        client = _manager_client()
        response = client.post(
            "/api/v1/packing-recording-schedules/",
            {"name": "Standard", "shift": shift.id, "is_active": True},
            format="json",
        )

        assert response.status_code == 201, response.data
        schedule = PackingRecordingSchedule.objects.get(id=response.data["id"])
        assert schedule.versions.count() == 1
        assert schedule.versions.get().status == PackingRecordingScheduleVersion.Status.DRAFT

    def test_activate_requires_at_least_one_block(self, organization, shift):
        schedule = PackingRecordingSchedule.objects.create(
            name="Standard", shift=shift, organization=organization
        )
        version = create_recording_schedule_draft(schedule)

        client = _manager_client()
        response = client.post(
            f"/api/v1/packing-recording-schedule-versions/{version.id}/activate/", {}, format="json"
        )

        assert response.status_code == 400

    def test_activate_archives_the_previous_active_version(self, organization, shift):
        v1 = _schedule_with_blocks(shift, organization, blocks=[("08:30", "10:30")])
        schedule = v1.schedule
        client = _manager_client()

        response = client.post(
            f"/api/v1/packing-recording-schedules/{schedule.id}/new-draft/", {}, format="json"
        )
        assert response.status_code == 201, response.data
        v2 = schedule.versions.exclude(id=v1.id).get()
        assert v2.blocks.count() == 1  # copied from v1

        response = client.post(
            f"/api/v1/packing-recording-schedule-versions/{v2.id}/activate/", {}, format="json"
        )
        assert response.status_code == 200, response.data
        v1.refresh_from_db()
        v2.refresh_from_db()
        assert v1.status == PackingRecordingScheduleVersion.Status.ARCHIVED
        assert v2.status == PackingRecordingScheduleVersion.Status.ACTIVE

    def test_active_version_blocks_cannot_be_edited(self, organization, shift):
        version = _schedule_with_blocks(shift, organization, blocks=[("08:30", "10:30")])

        client = _manager_client()
        response = client.post(
            f"/api/v1/packing-recording-schedule-versions/{version.id}/blocks/",
            {"blocks": [{"sequence": 1, "from_time": "09:00", "to_time": "10:00"}]},
            format="json",
        )

        assert response.status_code == 400


class TestExpectedBlocks:
    def test_no_schedule_falls_back_to_single_legacy_window(
        self, organization, line, shift, bay, work_centre, process_version
    ):
        plan_line = _plan_line(line, shift, bay, organization)
        job = get_or_create_job_for_plan_line(plan_line)
        allocation = _running_allocation(
            organization, job, bay, work_centre, process_version, started_at=timezone.now()
        )

        client = _manager_client()
        response = client.get(f"/api/v1/packing-allocations/{allocation.id}/recording-blocks/")

        assert response.status_code == 200, response.data
        assert len(response.data) == 1
        assert response.data[0]["schedule_block_id"] is None

    def test_schedule_offers_blocks_overlapping_the_allocation(
        self, organization, line, shift, bay, work_centre, process_version
    ):
        version = _schedule_with_blocks(
            shift, organization, blocks=[("08:30", "10:30"), ("10:30", "11:30"), ("14:00", "15:00")]
        )
        plan_line = _plan_line(line, shift, bay, organization)
        job = get_or_create_job_for_plan_line(plan_line)
        started = timezone.make_aware(timezone.datetime(2026, 9, 8, 9, 0))
        allocation = _running_allocation(
            organization, job, bay, work_centre, process_version, started_at=started, schedule_version=version
        )

        client = _manager_client()
        response = client.get(f"/api/v1/packing-allocations/{allocation.id}/recording-blocks/")

        assert response.status_code == 200, response.data
        # Started at 09:00 (mid-B1) — B1 offered (partial), B2 offered, B3 offered
        # (allocation still running = no upper bound clamp before shift end).
        labels = [row["display_label"] for row in response.data]
        assert any(l.startswith("B1") for l in labels)
        assert any(l.startswith("B2") for l in labels)
        assert any(l.startswith("B3") for l in labels)

    def test_partial_block_on_sku_change_is_clipped(
        self, organization, line, shift, bay, work_centre, process_version
    ):
        version = _schedule_with_blocks(shift, organization, blocks=[("11:30", "13:15")])
        plan_line = _plan_line(line, shift, bay, organization)
        job = get_or_create_job_for_plan_line(plan_line)
        started = timezone.make_aware(timezone.datetime(2026, 9, 8, 11, 30))
        stopped = timezone.make_aware(timezone.datetime(2026, 9, 8, 12, 10))
        allocation = _running_allocation(
            organization, job, bay, work_centre, process_version,
            started_at=started, completed_at=stopped, schedule_version=version,
        )

        client = _manager_client()
        response = client.get(f"/api/v1/packing-allocations/{allocation.id}/recording-blocks/")

        assert response.status_code == 200, response.data
        assert len(response.data) == 1
        row = response.data[0]
        assert row["is_partial"] is True
        assert row["scheduled_minutes"] == 40

    def test_already_recorded_block_is_excluded(
        self, organization, line, shift, bay, work_centre, process_version
    ):
        version = _schedule_with_blocks(shift, organization, blocks=[("08:30", "10:30")])
        plan_line = _plan_line(line, shift, bay, organization)
        job = get_or_create_job_for_plan_line(plan_line)
        started = timezone.make_aware(timezone.datetime(2026, 9, 8, 8, 30))
        allocation = _running_allocation(
            organization, job, bay, work_centre, process_version, started_at=started, schedule_version=version
        )

        client = _manager_client()
        response = client.post(
            f"/api/v1/packing-allocations/{allocation.id}/interval-records/",
            {"premium_qty": 100, "standard_qty": 5, "reject_qty": 2},
            format="json",
        )
        assert response.status_code == 201, response.data
        assert response.data["schedule_block"] == version.blocks.get().id

        response = client.get(f"/api/v1/packing-allocations/{allocation.id}/recording-blocks/")
        assert response.status_code == 200, response.data
        assert response.data == []
