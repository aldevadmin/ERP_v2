import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework.test import APIClient

from apps.accounts.models import Employee
from apps.customers.models import Customer
from apps.export_orders.models import ExportOrder, ExportOrderLine
from apps.packing.models import (
    PackingJob,
    PackingPlanLine,
    PackingShift,
    PackingWorkCentreAllocation,
    PackingWorkCentreSession,
    Shift,
)
from apps.packing.services import get_or_create_job_for_plan_line
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
def other_shift(organization):
    return Shift.objects.create(name="Shift 2", code="S2", organization=organization)


@pytest.fixture
def bay(organization):
    return Bay.objects.create(name="Bay 1", code="BAY-1", organization=organization)


@pytest.fixture
def other_bay(organization):
    return Bay.objects.create(name="Bay 2", code="BAY-2", organization=organization)


@pytest.fixture
def work_centre(organization, bay):
    wc_type, _ = WorkCentreType.objects.get_or_create(
        name="Station", defaults={"organization": organization}
    )
    return WorkCentre.objects.create(
        name="WC-01", code="WC-01", type=wc_type, bay=bay, organization=organization
    )


@pytest.fixture
def session(organization, shift, bay, work_centre):
    packing_shift = PackingShift.objects.create(date="2026-09-08", shift=shift, organization=organization)
    return PackingWorkCentreSession.objects.create(
        packing_shift=packing_shift, work_centre=work_centre, bay=bay, organization=organization
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


def _allocation(session, job, organization, *, status, sequence=1, qty=1000):
    return PackingWorkCentreAllocation.objects.create(
        session=session,
        job=job,
        sequence=sequence,
        assigned_qty=qty,
        status=status,
        organization=organization,
    )


class TestReschedule:
    def test_untouched_job_moves_in_place(self, organization, line, shift, other_shift, bay, other_bay):
        plan_line = _plan_line(line, shift, bay, organization)
        job = get_or_create_job_for_plan_line(plan_line)

        client = _manager_client()
        response = client.post(
            f"/api/v1/packing-plan-lines/{plan_line.id}/reschedule/",
            {"date": "2026-09-10", "shift": other_shift.id, "bay": other_bay.id},
            format="json",
        )

        assert response.status_code == 200, response.data
        plan_line.refresh_from_db()
        assert str(plan_line.date) == "2026-09-10"
        assert plan_line.shift_id == other_shift.id
        assert plan_line.bay_id == other_bay.id
        assert PackingPlanLine.objects.count() == 1
        job.refresh_from_db()
        assert job.status == PackingJob.Status.AWAITING_MATERIAL

    def test_job_with_any_allocation_splits_instead_of_moving(
        self, organization, line, shift, other_shift, bay, other_bay, session
    ):
        plan_line = _plan_line(line, shift, bay, organization, qty=10000)
        job = get_or_create_job_for_plan_line(plan_line)
        _allocation(session, job, organization, status=PackingWorkCentreAllocation.Status.PLANNED)

        client = _manager_client()
        response = client.post(
            f"/api/v1/packing-plan-lines/{plan_line.id}/reschedule/",
            {"date": "2026-09-10", "shift": other_shift.id, "bay": other_bay.id},
            format="json",
        )

        assert response.status_code == 200, response.data
        job.refresh_from_db()
        assert job.status == PackingJob.Status.COMPLETED

        new_line = PackingPlanLine.objects.exclude(id=plan_line.id).get()
        assert new_line.planned_qty == 10000
        assert new_line.plan_code == f"{line.line_code} Part 2"
        assert str(new_line.date) == "2026-09-10"
        assert new_line.status == PackingPlanLine.Status.PLANNED

    def test_quantity_cannot_exceed_outstanding_balance(
        self, organization, line, shift, other_shift, bay, other_bay, session
    ):
        plan_line = _plan_line(line, shift, bay, organization, qty=5000)
        job = get_or_create_job_for_plan_line(plan_line)
        _allocation(session, job, organization, status=PackingWorkCentreAllocation.Status.PLANNED)

        client = _manager_client()
        response = client.post(
            f"/api/v1/packing-plan-lines/{plan_line.id}/reschedule/",
            {"date": "2026-09-10", "shift": other_shift.id, "bay": other_bay.id, "quantity": 5001},
            format="json",
        )

        assert response.status_code == 400
        assert PackingPlanLine.objects.exclude(id=plan_line.id).count() == 0

    def test_running_job_cascades_instead_of_blocking(
        self, organization, line, shift, other_shift, bay, other_bay, session
    ):
        plan_line = _plan_line(line, shift, bay, organization)
        job = get_or_create_job_for_plan_line(plan_line)
        allocation = _allocation(
            session, job, organization, status=PackingWorkCentreAllocation.Status.RUNNING
        )

        client = _manager_client()
        response = client.post(
            f"/api/v1/packing-plan-lines/{plan_line.id}/reschedule/",
            {"date": "2026-09-10", "shift": other_shift.id, "bay": other_bay.id},
            format="json",
        )

        assert response.status_code == 200, response.data
        allocation.refresh_from_db()
        assert allocation.status == PackingWorkCentreAllocation.Status.CANCELLED
        job.refresh_from_db()
        assert job.status == PackingJob.Status.COMPLETED
        assert PackingPlanLine.objects.exclude(id=plan_line.id).count() == 1

    def test_can_reschedule_is_false_once_returned_to_demand(
        self, organization, line, shift, bay, session
    ):
        """A Job stopped with "return to demand" cancels its own Plan
        Line — the Job's own `can_reschedule` flag must say so, and the
        reschedule endpoint itself must refuse it.
        """
        plan_line = _plan_line(line, shift, bay, organization)
        job = get_or_create_job_for_plan_line(plan_line)
        _allocation(session, job, organization, status=PackingWorkCentreAllocation.Status.RUNNING)
        job.status = PackingJob.Status.IN_PROGRESS
        job.save(update_fields=["status"])

        client = _manager_client()
        stop_response = client.post(
            f"/api/v1/packing-jobs/{job.id}/stop/",
            {"reason": "Quality issue", "return_to_demand": True},
            format="json",
        )
        assert stop_response.status_code == 200, stop_response.data

        detail_response = client.get(f"/api/v1/packing-jobs/{job.id}/")
        assert detail_response.data["can_reschedule"] is False

        reschedule_response = client.post(
            f"/api/v1/packing-plan-lines/{plan_line.id}/reschedule/",
            {"date": "2026-09-12", "shift": shift.id, "bay": bay.id},
            format="json",
        )
        assert reschedule_response.status_code == 404

    def test_can_reschedule_stays_true_when_not_returned_to_demand(
        self, organization, line, shift, bay, session
    ):
        plan_line = _plan_line(line, shift, bay, organization)
        job = get_or_create_job_for_plan_line(plan_line)
        _allocation(session, job, organization, status=PackingWorkCentreAllocation.Status.RUNNING)
        job.status = PackingJob.Status.IN_PROGRESS
        job.save(update_fields=["status"])

        client = _manager_client()
        stop_response = client.post(
            f"/api/v1/packing-jobs/{job.id}/stop/",
            {"reason": "Written off", "return_to_demand": False},
            format="json",
        )
        assert stop_response.status_code == 200, stop_response.data

        detail_response = client.get(f"/api/v1/packing-jobs/{job.id}/")
        assert detail_response.data["can_reschedule"] is True


class TestCancelJob:
    def test_requires_a_reason(self, organization, line, shift, bay):
        plan_line = _plan_line(line, shift, bay, organization)
        job = get_or_create_job_for_plan_line(plan_line)

        client = _manager_client()
        response = client.post(f"/api/v1/packing-jobs/{job.id}/cancel/", {}, format="json")

        assert response.status_code == 400
        job.refresh_from_db()
        assert job.status != PackingJob.Status.CANCELLED

    def test_cancels_and_records_reason(self, organization, line, shift, bay):
        plan_line = _plan_line(line, shift, bay, organization)
        job = get_or_create_job_for_plan_line(plan_line)

        client = _manager_client()
        response = client.post(
            f"/api/v1/packing-jobs/{job.id}/cancel/",
            {"reason": "Quality issue with raw material"},
            format="json",
        )

        assert response.status_code == 200, response.data
        job.refresh_from_db()
        assert job.status == PackingJob.Status.CANCELLED
        assert "Quality issue with raw material" in job.remarks

    def test_auto_cancels_queued_allocations_elsewhere(
        self, organization, line, shift, bay, session, work_centre
    ):
        plan_line = _plan_line(line, shift, bay, organization)
        job = get_or_create_job_for_plan_line(plan_line)
        alloc1 = _allocation(session, job, organization, status=PackingWorkCentreAllocation.Status.PLANNED)

        other_wc_type = WorkCentreType.objects.get(name="Station")
        other_wc = WorkCentre.objects.create(
            name="WC-02", code="WC-02", type=other_wc_type, bay=bay, organization=organization
        )
        other_session = PackingWorkCentreSession.objects.create(
            packing_shift=session.packing_shift, work_centre=other_wc, bay=bay, organization=organization
        )
        alloc2 = _allocation(
            other_session, job, organization, status=PackingWorkCentreAllocation.Status.READY, sequence=1
        )

        client = _manager_client()
        response = client.post(
            f"/api/v1/packing-jobs/{job.id}/cancel/", {"reason": "Priority change"}, format="json"
        )

        assert response.status_code == 200, response.data
        alloc1.refresh_from_db()
        alloc2.refresh_from_db()
        assert alloc1.status == PackingWorkCentreAllocation.Status.CANCELLED
        assert alloc2.status == PackingWorkCentreAllocation.Status.CANCELLED

    def test_blocked_while_running_on_the_floor(self, organization, line, shift, bay, session):
        plan_line = _plan_line(line, shift, bay, organization)
        job = get_or_create_job_for_plan_line(plan_line)
        _allocation(session, job, organization, status=PackingWorkCentreAllocation.Status.RUNNING)

        client = _manager_client()
        response = client.post(
            f"/api/v1/packing-jobs/{job.id}/cancel/", {"reason": "Priority change"}, format="json"
        )

        assert response.status_code == 400
        job.refresh_from_db()
        assert job.status != PackingJob.Status.CANCELLED

    def test_cannot_cancel_an_already_closed_job(self, organization, line, shift, bay):
        plan_line = _plan_line(line, shift, bay, organization)
        job = get_or_create_job_for_plan_line(plan_line)
        job.status = PackingJob.Status.COMPLETED
        job.save(update_fields=["status"])

        client = _manager_client()
        response = client.post(
            f"/api/v1/packing-jobs/{job.id}/cancel/", {"reason": "Too late"}, format="json"
        )

        assert response.status_code == 400


class TestPauseResumeStop:
    def test_hold_cascades_and_releases_by_default(self, organization, line, shift, bay, session):
        plan_line = _plan_line(line, shift, bay, organization)
        job = get_or_create_job_for_plan_line(plan_line)
        allocation = _allocation(
            session, job, organization, status=PackingWorkCentreAllocation.Status.RUNNING
        )

        client = _manager_client()
        response = client.post(
            f"/api/v1/packing-jobs/{job.id}/hold/", {"reason": "Quality issue"}, format="json"
        )

        assert response.status_code == 200, response.data
        job.refresh_from_db()
        assert job.status == PackingJob.Status.ON_HOLD
        allocation.refresh_from_db()
        assert allocation.status == PackingWorkCentreAllocation.Status.CANCELLED
        session.refresh_from_db()
        assert session.status == PackingWorkCentreSession.Status.IDLE

    def test_hold_keeps_work_centre_reserved_when_not_released(
        self, organization, line, shift, bay, session
    ):
        plan_line = _plan_line(line, shift, bay, organization)
        job = get_or_create_job_for_plan_line(plan_line)
        allocation = _allocation(
            session, job, organization, status=PackingWorkCentreAllocation.Status.RUNNING
        )

        client = _manager_client()
        response = client.post(
            f"/api/v1/packing-jobs/{job.id}/hold/",
            {"reason": "Quality issue", "release_work_centres": False},
            format="json",
        )

        assert response.status_code == 200, response.data
        allocation.refresh_from_db()
        assert allocation.status == PackingWorkCentreAllocation.Status.ON_HOLD

    def test_complete_cascades_running_allocation(self, organization, line, shift, bay, session):
        plan_line = _plan_line(line, shift, bay, organization)
        job = get_or_create_job_for_plan_line(plan_line)
        allocation = _allocation(
            session, job, organization, status=PackingWorkCentreAllocation.Status.RUNNING
        )

        client = _manager_client()
        response = client.post(f"/api/v1/packing-jobs/{job.id}/complete/", {}, format="json")

        assert response.status_code == 200, response.data
        job.refresh_from_db()
        assert job.status == PackingJob.Status.COMPLETED
        allocation.refresh_from_db()
        assert allocation.status == PackingWorkCentreAllocation.Status.CANCELLED

    def test_hold_allowed_when_not_running(self, organization, line, shift, bay):
        plan_line = _plan_line(line, shift, bay, organization)
        job = get_or_create_job_for_plan_line(plan_line)

        client = _manager_client()
        response = client.post(f"/api/v1/packing-jobs/{job.id}/hold/", {}, format="json")

        assert response.status_code == 200, response.data
        job.refresh_from_db()
        assert job.status == PackingJob.Status.ON_HOLD

    def test_resume_brings_selected_allocation_back_running(
        self, organization, line, shift, bay, session
    ):
        plan_line = _plan_line(line, shift, bay, organization)
        job = get_or_create_job_for_plan_line(plan_line)
        allocation = _allocation(
            session, job, organization, status=PackingWorkCentreAllocation.Status.ON_HOLD
        )
        job.status = PackingJob.Status.ON_HOLD
        job.save(update_fields=["status"])

        client = _manager_client()
        response = client.post(
            f"/api/v1/packing-jobs/{job.id}/resume/",
            {"allocation_ids": [allocation.id]},
            format="json",
        )

        assert response.status_code == 200, response.data
        job.refresh_from_db()
        assert job.status == PackingJob.Status.IN_PROGRESS
        allocation.refresh_from_db()
        assert allocation.status == PackingWorkCentreAllocation.Status.RUNNING
        session.refresh_from_db()
        assert session.status == PackingWorkCentreSession.Status.RUNNING

    def test_resume_queues_when_session_already_busy(
        self, organization, line, shift, bay, session, work_centre
    ):
        plan_line = _plan_line(line, shift, bay, organization)
        job = get_or_create_job_for_plan_line(plan_line)
        held = _allocation(
            session, job, organization, status=PackingWorkCentreAllocation.Status.ON_HOLD, sequence=1
        )
        other_wc_type = WorkCentreType.objects.get(name="Station")
        other_job_plan = _plan_line(line, shift, bay, organization, part=2)
        other_job = get_or_create_job_for_plan_line(other_job_plan)
        _allocation(
            session, other_job, organization, status=PackingWorkCentreAllocation.Status.RUNNING, sequence=2
        )
        job.status = PackingJob.Status.ON_HOLD
        job.save(update_fields=["status"])

        client = _manager_client()
        response = client.post(
            f"/api/v1/packing-jobs/{job.id}/resume/", {"allocation_ids": [held.id]}, format="json"
        )

        assert response.status_code == 200, response.data
        held.refresh_from_db()
        assert held.status == PackingWorkCentreAllocation.Status.PLANNED

    def test_resume_requires_job_to_be_paused(self, organization, line, shift, bay):
        plan_line = _plan_line(line, shift, bay, organization)
        job = get_or_create_job_for_plan_line(plan_line)

        client = _manager_client()
        response = client.post(
            f"/api/v1/packing-jobs/{job.id}/resume/", {"allocation_ids": []}, format="json"
        )

        assert response.status_code == 400


class TestStopJob:
    def test_requires_a_reason(self, organization, line, shift, bay, session):
        plan_line = _plan_line(line, shift, bay, organization)
        job = get_or_create_job_for_plan_line(plan_line)
        _allocation(session, job, organization, status=PackingWorkCentreAllocation.Status.RUNNING)

        client = _manager_client()
        response = client.post(f"/api/v1/packing-jobs/{job.id}/stop/", {}, format="json")

        assert response.status_code == 400

    def test_not_allowed_before_the_job_has_started(self, organization, line, shift, bay):
        plan_line = _plan_line(line, shift, bay, organization)
        job = get_or_create_job_for_plan_line(plan_line)

        client = _manager_client()
        response = client.post(
            f"/api/v1/packing-jobs/{job.id}/stop/", {"reason": "Order changed"}, format="json"
        )

        assert response.status_code == 400

    def test_stop_cascades_and_returns_balance_to_demand(
        self, organization, line, shift, bay, session
    ):
        plan_line = _plan_line(line, shift, bay, organization)
        job = get_or_create_job_for_plan_line(plan_line)
        allocation = _allocation(
            session, job, organization, status=PackingWorkCentreAllocation.Status.RUNNING
        )
        job.status = PackingJob.Status.IN_PROGRESS
        job.save(update_fields=["status"])

        client = _manager_client()
        response = client.post(
            f"/api/v1/packing-jobs/{job.id}/stop/",
            {"reason": "Order changed", "return_to_demand": True},
            format="json",
        )

        assert response.status_code == 200, response.data
        job.refresh_from_db()
        assert job.status == PackingJob.Status.STOPPED
        allocation.refresh_from_db()
        assert allocation.status == PackingWorkCentreAllocation.Status.CANCELLED
        plan_line.refresh_from_db()
        assert plan_line.status == PackingPlanLine.Status.CANCELLED

    def test_stop_without_return_to_demand_keeps_plan_line(
        self, organization, line, shift, bay, session
    ):
        plan_line = _plan_line(line, shift, bay, organization)
        job = get_or_create_job_for_plan_line(plan_line)
        _allocation(session, job, organization, status=PackingWorkCentreAllocation.Status.RUNNING)
        job.status = PackingJob.Status.IN_PROGRESS
        job.save(update_fields=["status"])

        client = _manager_client()
        response = client.post(
            f"/api/v1/packing-jobs/{job.id}/stop/",
            {"reason": "Written off", "return_to_demand": False},
            format="json",
        )

        assert response.status_code == 200, response.data
        plan_line.refresh_from_db()
        assert plan_line.status != PackingPlanLine.Status.CANCELLED


class TestJobEvents:
    def test_lifecycle_actions_are_logged(self, organization, line, shift, bay, session):
        plan_line = _plan_line(line, shift, bay, organization)
        job = get_or_create_job_for_plan_line(plan_line)
        _allocation(session, job, organization, status=PackingWorkCentreAllocation.Status.RUNNING)

        client = _manager_client()
        client.post(f"/api/v1/packing-jobs/{job.id}/hold/", {"reason": "Quality"}, format="json")

        response = client.get(f"/api/v1/packing-jobs/{job.id}/events/")
        assert response.status_code == 200, response.data
        event_types = [e["event_type"] for e in response.data]
        assert "PAUSE" in event_types
        pause_event = next(e for e in response.data if e["event_type"] == "PAUSE")
        assert pause_event["reason"] == "Quality"
        assert pause_event["performed_by"] is not None

    def test_cancel_is_logged(self, organization, line, shift, bay):
        plan_line = _plan_line(line, shift, bay, organization)
        job = get_or_create_job_for_plan_line(plan_line)

        client = _manager_client()
        client.post(f"/api/v1/packing-jobs/{job.id}/cancel/", {"reason": "Priority change"}, format="json")

        response = client.get(f"/api/v1/packing-jobs/{job.id}/events/")
        assert response.status_code == 200, response.data
        assert any(e["event_type"] == "CANCEL" for e in response.data)


class TestUnassignedJobs:
    def test_released_job_with_no_allocation_is_unassigned(self, organization, line, shift, bay):
        plan_line = _plan_line(line, shift, bay, organization)
        job = get_or_create_job_for_plan_line(plan_line)

        client = _manager_client()
        response = client.get(
            f"/api/v1/packing-today/?date={plan_line.date}&shift_id={shift.id}"
        )

        assert response.status_code == 200, response.data
        job_numbers = [j["job_number"] for j in response.data["unassigned_jobs"]]
        assert job.job_number in job_numbers

    def test_job_with_an_allocation_is_not_unassigned(
        self, organization, line, shift, bay, session
    ):
        plan_line = _plan_line(line, shift, bay, organization)
        job = get_or_create_job_for_plan_line(plan_line)
        _allocation(session, job, organization, status=PackingWorkCentreAllocation.Status.PLANNED)

        client = _manager_client()
        response = client.get(
            f"/api/v1/packing-today/?date={plan_line.date}&shift_id={shift.id}"
        )

        assert response.status_code == 200, response.data
        job_numbers = [j["job_number"] for j in response.data["unassigned_jobs"]]
        assert job.job_number not in job_numbers

    def test_cancelled_job_is_not_unassigned(self, organization, line, shift, bay):
        plan_line = _plan_line(line, shift, bay, organization)
        job = get_or_create_job_for_plan_line(plan_line)
        job.status = PackingJob.Status.CANCELLED
        job.save(update_fields=["status"])

        client = _manager_client()
        response = client.get(
            f"/api/v1/packing-today/?date={plan_line.date}&shift_id={shift.id}"
        )

        assert response.status_code == 200, response.data
        job_numbers = [j["job_number"] for j in response.data["unassigned_jobs"]]
        assert job.job_number not in job_numbers

    def test_job_on_a_different_date_is_excluded(
        self, organization, line, shift, bay, other_bay
    ):
        plan_line = _plan_line(line, shift, bay, organization, date="2026-09-08")
        get_or_create_job_for_plan_line(plan_line)
        other_plan_line = _plan_line(line, shift, other_bay, organization, date="2026-09-09", part=2)
        other_job = get_or_create_job_for_plan_line(other_plan_line)

        client = _manager_client()
        response = client.get(f"/api/v1/packing-today/?date=2026-09-08&shift_id={shift.id}")

        assert response.status_code == 200, response.data
        job_numbers = [j["job_number"] for j in response.data["unassigned_jobs"]]
        assert other_job.job_number not in job_numbers


class TestActiveJobs:
    def test_job_with_running_allocation_is_active(
        self, organization, line, shift, bay, session
    ):
        plan_line = _plan_line(line, shift, bay, organization)
        job = get_or_create_job_for_plan_line(plan_line)
        _allocation(session, job, organization, status=PackingWorkCentreAllocation.Status.RUNNING)

        client = _manager_client()
        response = client.get(
            f"/api/v1/packing-today/?date={plan_line.date}&shift_id={shift.id}"
        )

        assert response.status_code == 200, response.data
        job_numbers = [j["job_number"] for j in response.data["active_jobs"]]
        assert job.job_number in job_numbers

    def test_job_with_a_completed_allocation_stays_on_the_floor_board(
        self, organization, line, shift, bay, session
    ):
        """A Job's row should stay put (now showing Completed) rather than
        disappear from the floor the moment its last allocation finishes.
        """
        plan_line = _plan_line(line, shift, bay, organization)
        job = get_or_create_job_for_plan_line(plan_line)
        _allocation(session, job, organization, status=PackingWorkCentreAllocation.Status.COMPLETED)

        client = _manager_client()
        response = client.get(
            f"/api/v1/packing-today/?date={plan_line.date}&shift_id={shift.id}"
        )

        assert response.status_code == 200, response.data
        job_numbers = [j["job_number"] for j in response.data["active_jobs"]]
        assert job.job_number in job_numbers

    def test_job_with_only_a_cancelled_allocation_is_not_active(
        self, organization, line, shift, bay, session
    ):
        plan_line = _plan_line(line, shift, bay, organization)
        job = get_or_create_job_for_plan_line(plan_line)
        _allocation(session, job, organization, status=PackingWorkCentreAllocation.Status.CANCELLED)

        client = _manager_client()
        response = client.get(
            f"/api/v1/packing-today/?date={plan_line.date}&shift_id={shift.id}"
        )

        assert response.status_code == 200, response.data
        job_numbers = [j["job_number"] for j in response.data["active_jobs"]]
        assert job.job_number not in job_numbers

    def test_completed_job_stays_on_the_board_even_if_its_allocation_was_cancelled(
        self, organization, line, shift, bay, session
    ):
        """A Job stopped (cascading its allocation to CANCELLED) and then
        completed manually still needs to show up — the allocation-status
        check alone wouldn't surface it.
        """
        plan_line = _plan_line(line, shift, bay, organization)
        job = get_or_create_job_for_plan_line(plan_line)
        _allocation(session, job, organization, status=PackingWorkCentreAllocation.Status.CANCELLED)
        job.status = PackingJob.Status.COMPLETED
        job.save(update_fields=["status"])

        client = _manager_client()
        response = client.get(
            f"/api/v1/packing-today/?date={plan_line.date}&shift_id={shift.id}"
        )

        assert response.status_code == 200, response.data
        job_numbers = [j["job_number"] for j in response.data["active_jobs"]]
        assert job.job_number in job_numbers

    def test_unassigned_job_is_not_active(self, organization, line, shift, bay):
        plan_line = _plan_line(line, shift, bay, organization)
        job = get_or_create_job_for_plan_line(plan_line)

        client = _manager_client()
        response = client.get(
            f"/api/v1/packing-today/?date={plan_line.date}&shift_id={shift.id}"
        )

        assert response.status_code == 200, response.data
        job_numbers = [j["job_number"] for j in response.data["active_jobs"]]
        assert job.job_number not in job_numbers


class TestStartAllocation:
    def test_starting_the_first_allocation_moves_job_to_in_progress(
        self, organization, line, shift, bay, session
    ):
        plan_line = _plan_line(line, shift, bay, organization)
        job = get_or_create_job_for_plan_line(plan_line)
        job.status = PackingJob.Status.READY
        job.save(update_fields=["status"])

        category = ProcessCategory.objects.create(name="Packing", organization=organization)
        definition = ProcessDefinition.objects.create(
            name="Sorting/Cleaning/Packing", code="SCP", organization=organization
        )
        version = ProcessDefinitionVersion.objects.create(
            process_definition=definition, version_number=1, category=category, organization=organization
        )
        allocation = _allocation(
            session, job, organization, status=PackingWorkCentreAllocation.Status.PLANNED
        )
        allocation.process_version = version
        allocation.save(update_fields=["process_version"])

        client = _manager_client()
        response = client.post(f"/api/v1/packing-allocations/{allocation.id}/start/", {}, format="json")

        assert response.status_code == 200, response.data
        allocation.refresh_from_db()
        assert allocation.status == PackingWorkCentreAllocation.Status.RUNNING
        job.refresh_from_db()
        assert job.status == PackingJob.Status.IN_PROGRESS


class TestAddWorkCentreToRunningShift:
    def test_new_work_centre_creates_a_session_mid_shift(
        self, organization, shift, bay, session, work_centre
    ):
        other_wc_type = WorkCentreType.objects.get(name="Station")
        other_wc = WorkCentre.objects.create(
            name="CSP-06", code="CSP-06", type=other_wc_type, bay=bay, organization=organization
        )
        deepa = Employee.objects.create(employee_code="E1", full_name="Deepa", organization=organization)

        client = _manager_client()
        response = client.post(
            "/api/v1/packing-shifts/start/",
            {
                "date": "2026-09-08",
                "shift": shift.id,
                "work_centres": [{"work_centre": other_wc.id, "operator_ids": [deepa.id]}],
            },
            format="json",
        )

        assert response.status_code in (200, 201), response.data
        assert PackingWorkCentreSession.objects.filter(
            packing_shift=session.packing_shift, work_centre=other_wc
        ).exists()

    def test_operator_already_on_another_session_today_is_rejected(
        self, organization, shift, bay, session, work_centre
    ):
        ravi = Employee.objects.create(employee_code="E2", full_name="Ravi", organization=organization)
        from apps.packing.models import PackingWorkCentreSessionOperator

        PackingWorkCentreSessionOperator.objects.create(
            session=session, employee=ravi, organization=organization
        )

        other_wc_type = WorkCentreType.objects.get(name="Station")
        other_wc = WorkCentre.objects.create(
            name="CSP-07", code="CSP-07", type=other_wc_type, bay=bay, organization=organization
        )

        client = _manager_client()
        response = client.post(
            "/api/v1/packing-shifts/start/",
            {
                "date": "2026-09-08",
                "shift": shift.id,
                "work_centres": [{"work_centre": other_wc.id, "operator_ids": [ravi.id]}],
            },
            format="json",
        )

        assert response.status_code == 400
        assert not PackingWorkCentreSession.objects.filter(work_centre=other_wc).exists()


class TestMaterialGateOnAllocation:
    """A Job's material must be received before it can get a Work Centre
    allocation — the one place a new allocation is ever created
    (`PackingWorkCentreSessionViewSet.allocations`), covering both "Add
    Work Centre" and "Assign Work".
    """

    def test_awaiting_material_job_cannot_get_a_work_centre_allocation(
        self, organization, line, shift, bay, session
    ):
        plan_line = _plan_line(line, shift, bay, organization)
        job = get_or_create_job_for_plan_line(plan_line)
        assert job.status == PackingJob.Status.AWAITING_MATERIAL

        client = _manager_client()
        response = client.post(
            f"/api/v1/packing-work-centre-sessions/{session.id}/allocations/",
            {"job": job.id, "assigned_qty": 1000},
            format="json",
        )

        assert response.status_code == 400
        assert not PackingWorkCentreAllocation.objects.filter(job=job).exists()

    def test_ready_job_can_get_a_work_centre_allocation(self, organization, line, shift, bay, session):
        plan_line = _plan_line(line, shift, bay, organization)
        job = get_or_create_job_for_plan_line(plan_line)
        job.status = PackingJob.Status.READY
        job.save(update_fields=["status"])

        client = _manager_client()
        response = client.post(
            f"/api/v1/packing-work-centre-sessions/{session.id}/allocations/",
            {"job": job.id, "assigned_qty": 1000},
            format="json",
        )

        assert response.status_code == 201, response.data
