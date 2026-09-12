"""Service functions for the Packing module — kept out of views.py/models.py
so each business rule lives in one obvious, greppable place (per this
project's "Backend owns business logic" principle), matching the pattern
already used by `apps.tooling.services` etc.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any

from django.db import transaction
from django.db.models import Max, Q, Sum
from django.utils import timezone

from apps.core.models import Organization
from apps.export_orders.models import ExportOrderLine
from apps.items.models import Item
from apps.processes.models import ProcessDefinitionVersion
from apps.processes.serializers import ProcessExecutionSerializer
from apps.work_centres.models import Bay, WorkCentre

from .models import (
    PackingExecutionConfig,
    PackingIntervalRecord,
    PackingJob,
    PackingJobEvent,
    PackingPlanLine,
    PackingRecordingBlock,
    PackingRecordingSchedule,
    PackingRecordingScheduleVersion,
    PackingShift,
    PackingWorkCentreAllocation,
    PackingWorkCentreSession,
    PackingWorkCentreSessionOperator,
    Shift,
)


def generate_plan_code(export_order_line: ExportOrderLine) -> str:
    """`[PO#][customer SKU code] Part {n}` — frozen once at creation (like
    `PackingJob.job_number`), so it never renumbers if a later plan line
    against the same order line is added or cancelled. `n` is the count of
    plan lines already created against this line, including cancelled
    ones (so a plan that was cancelled keeps its number rather than being
    silently reused by a different plan) — deleting a still-DRAFT/PLANNED
    line, which the delete endpoint allows, does free its number back up,
    since that plan never became a real commitment.
    """
    existing = PackingPlanLine.objects.filter(export_order_line=export_order_line).count()
    return f"{export_order_line.line_code} Part {existing + 1}"


def packable_qty_for_line(line: ExportOrderLine) -> int:
    """The authoritative "available to pack" ceiling for a line — accepted
    Production plus accepted Procurement only, per CLAUDE.md's "Export
    Order availability uses Accepted [Production/Procurement] quantity
    only" rule. Mirrors `ProductionRequirement.cumulative_accepted` /
    `ProcurementRequirement.cumulative_accepted` exactly; those properties
    read from a real `ProductionRequirement`/`ProcurementRequirement` row,
    which (per their own docstrings) may not exist yet for a line with no
    transactions — hence `getattr(..., None)` before reading the property.
    """
    production = getattr(line, "production_requirement", None)
    procurement = getattr(line, "procurement_requirement", None)
    accepted_production = production.cumulative_accepted if production else 0
    accepted_procurement = procurement.cumulative_accepted if procurement else 0
    return accepted_production + accepted_procurement


@dataclass
class PackingDemandRow:
    export_order_line: ExportOrderLine
    required_qty: int
    packable_qty: int
    packed_qty: int
    balance_qty: int
    planned_qty: int
    unplanned_qty: int


def packing_demand_row(line: ExportOrderLine) -> PackingDemandRow:
    required = line.required_pieces
    packable = min(packable_qty_for_line(line), required)
    packed = line.packed_pieces
    balance = max(required - packed, 0)
    planned = (
        line.packing_plan_lines.exclude(status=PackingPlanLine.Status.CANCELLED).aggregate(
            total=Sum("planned_qty")
        )["total"]
        or 0
    )
    unplanned = max(balance - planned, 0)
    return PackingDemandRow(
        export_order_line=line,
        required_qty=required,
        packable_qty=packable,
        packed_qty=packed,
        balance_qty=balance,
        planned_qty=planned,
        unplanned_qty=unplanned,
    )


def get_or_create_job_for_plan_line(plan_line: PackingPlanLine) -> PackingJob:
    """Idempotent per spec §4.3 — calling this twice for the same plan
    line returns the same job rather than creating a duplicate, since
    `PackingJob.plan_line` is a `OneToOneField`.
    """
    from apps.core.models import Sequence

    existing = getattr(plan_line, "packing_job", None)
    if existing is not None:
        return existing

    line = plan_line.export_order_line
    mapping_version = line.source_mapping_version
    packaging_profile_version = (
        mapping_version.packaging_profile_version if mapping_version else None
    )

    with transaction.atomic():
        seq = Sequence.next_value("packing_job")
        job = PackingJob.objects.create(
            plan_line=plan_line,
            job_number=f"PJ-{seq:04d}",
            target_qty=plan_line.planned_qty,
            packaging_profile_version=packaging_profile_version,
            pieces_per_pouch=line.pieces_per_pouch,
            pouches_per_carton=line.pouches_per_carton,
            organization=plan_line.organization,
        )
        if plan_line.status == PackingPlanLine.Status.DRAFT:
            plan_line.status = PackingPlanLine.Status.PLANNED
            plan_line.save(update_fields=["status"])
    return job


def job_has_running_allocation(job: PackingJob) -> bool:
    """True if this Job currently has a `RUNNING` allocation on *any* Work
    Centre Session — the shared floor-safety gate for Hold/Cancel/Complete/
    Reschedule, so none of them can silently contradict what a Work Centre
    is actively doing right now. A Job's allocations can span more than
    one Work Centre at once (its target may be split across stations), so
    this deliberately checks every allocation, not just the one on
    whichever Work Centre the caller happens to be looking at.
    """
    return job.allocations.filter(status=PackingWorkCentreAllocation.Status.RUNNING).exists()


def _release_job_allocations(job: PackingJob, *, cancel: bool) -> None:
    """Ends every one of this Job's non-terminal allocations (RUNNING/
    PLANNED/READY/ON_HOLD) — `cancel=True` fully releases the Work Centre
    (CANCELLED, free for any other Job immediately); `cancel=False` sets
    them ON_HOLD instead, staying associated with this Job so Resume can
    bring them back without re-assigning from scratch. Whichever Work
    Centre Session each allocation belonged to drops back to IDLE (unless
    it's in ISSUE/STOPPED) once it no longer has a RUNNING allocation.
    """
    new_status = (
        PackingWorkCentreAllocation.Status.CANCELLED
        if cancel
        else PackingWorkCentreAllocation.Status.ON_HOLD
    )
    allocations = job.allocations.exclude(
        status__in=[
            PackingWorkCentreAllocation.Status.COMPLETED,
            PackingWorkCentreAllocation.Status.CANCELLED,
        ]
    ).select_related("session")
    sessions = {allocation.session_id: allocation.session for allocation in allocations}
    allocations.update(status=new_status, updated_at=timezone.now())
    for session in sessions.values():
        if session.current_allocation is None and session.status not in (
            PackingWorkCentreSession.Status.STOPPED,
            PackingWorkCentreSession.Status.ISSUE,
        ):
            session.status = PackingWorkCentreSession.Status.IDLE
            session.save(update_fields=["status", "updated_at"])


def record_job_event(
    job: PackingJob,
    event_type: str,
    *,
    user: Any,
    reason: str = "",
    remarks: str = "",
    details: dict[str, Any] | None = None,
) -> PackingJobEvent:
    return PackingJobEvent.objects.create(
        job=job,
        event_type=event_type,
        reason=reason,
        remarks=remarks,
        details=details or {},
        performed_by=user if getattr(user, "is_authenticated", False) else None,
        organization=job.organization,
    )


def cancel_job(job: PackingJob, *, reason: str, user: Any = None) -> PackingJob:
    """Marks a Job CANCELLED — e.g. a quality issue with the material, or
    a priority change that frees up the floor for something else. Blocked
    while the Job is actively running anywhere (see
    `job_has_running_allocation`) — unlike Pause/Stop/Complete, Cancel is
    not in the spec's action matrix for a RUNNING Job, so it keeps the
    "stop it on the floor first" rule. Auto-cancels the Job's own
    still-queued allocations (PLANNED/READY) on any Work Centre, since
    they'd otherwise be left pointing at a Job that no longer expects any
    more work.
    """
    if job.status in (PackingJob.Status.COMPLETED, PackingJob.Status.CANCELLED):
        raise ValueError("This Job is already closed.")
    if job_has_running_allocation(job):
        raise ValueError("This Job is running on the floor right now — stop it before cancelling.")

    with transaction.atomic():
        job.status = PackingJob.Status.CANCELLED
        job.remarks = f"{job.remarks}\n\nCancelled: {reason}".strip() if job.remarks else f"Cancelled: {reason}"
        job.save(update_fields=["status", "remarks", "updated_at"])
        job.allocations.filter(
            status__in=[
                PackingWorkCentreAllocation.Status.PLANNED,
                PackingWorkCentreAllocation.Status.READY,
            ]
        ).update(status=PackingWorkCentreAllocation.Status.CANCELLED)
        record_job_event(job, PackingJobEvent.EventType.CANCEL, user=user, reason=reason)
    return job


def pause_job(
    job: PackingJob, *, reason: str, remarks: str, release_work_centres: bool, user: Any
) -> PackingJob:
    """"Pause Job" — spec v5 §6.2. Unlike Cancel/Reschedule, Pause is meant
    to be used on a Job that's actively running right now: pausing stops
    its allocations' productive time immediately rather than requiring the
    floor to be stopped first. `release_work_centres` decides what happens
    to those Work Centres: released ones go CANCELLED (free for any other
    Job right away); kept ones go ON_HOLD (stay reserved for this Job,
    ready for Resume to bring back without re-assigning).
    """
    if job.status in (
        PackingJob.Status.COMPLETED,
        PackingJob.Status.CANCELLED,
        PackingJob.Status.STOPPED,
    ):
        raise ValueError("This Job is already closed.")
    if job.status == PackingJob.Status.ON_HOLD:
        raise ValueError("This Job is already paused.")

    with transaction.atomic():
        _release_job_allocations(job, cancel=release_work_centres)
        job.status = PackingJob.Status.ON_HOLD
        job.save(update_fields=["status", "updated_at"])
        record_job_event(
            job,
            PackingJobEvent.EventType.PAUSE,
            user=user,
            reason=reason,
            remarks=remarks,
            details={"release_work_centres": release_work_centres},
        )
    return job


def resume_job(job: PackingJob, *, allocation_ids: list[int], user: Any) -> PackingJob:
    """"Resume Job" — spec v5 §6.3. Only the caller-selected ON_HOLD
    allocations come back: each resumes RUNNING if its Work Centre Session
    is currently free, or drops back to PLANNED (queued) if that session
    picked up other work while this Job was paused — either way it stays
    with this Job rather than needing to be reassigned from scratch.
    """
    if job.status != PackingJob.Status.ON_HOLD:
        raise ValueError("Only a paused Job can be resumed.")

    with transaction.atomic():
        allocations = job.allocations.filter(
            id__in=allocation_ids, status=PackingWorkCentreAllocation.Status.ON_HOLD
        ).select_related("session")
        for allocation in allocations:
            session = allocation.session
            if session.current_allocation is None:
                allocation.status = PackingWorkCentreAllocation.Status.RUNNING
                allocation.started_at = timezone.now()
                session.status = PackingWorkCentreSession.Status.RUNNING
                session.save(update_fields=["status", "updated_at"])
            else:
                allocation.status = PackingWorkCentreAllocation.Status.PLANNED
            allocation.save(update_fields=["status", "started_at", "updated_at"])
        job.status = PackingJob.Status.IN_PROGRESS
        job.save(update_fields=["status", "updated_at"])
        record_job_event(job, PackingJobEvent.EventType.RESUME, user=user)
    return job


def complete_job(job: PackingJob, *, user: Any) -> PackingJob:
    """"Complete Job" — spec v5 §6.5. Available even while running: any
    active/queued allocations are released (Work Centres freed) since
    nothing more should be recorded against a Job that's now done.
    Whatever was actually packed stays exactly as recorded — this can
    legitimately close a Job out short of its target (see
    `reschedule_plan_line`'s split path for carrying the rest forward).
    """
    if job.status in (
        PackingJob.Status.COMPLETED,
        PackingJob.Status.CANCELLED,
        PackingJob.Status.STOPPED,
    ):
        raise ValueError("This Job is already closed.")

    with transaction.atomic():
        _release_job_allocations(job, cancel=True)
        job.status = PackingJob.Status.COMPLETED
        job.save(update_fields=["status", "updated_at"])
        record_job_event(job, PackingJobEvent.EventType.COMPLETE, user=user)
    return job


def stop_job(
    job: PackingJob, *, reason: str, remarks: str, return_to_demand: bool, user: Any
) -> PackingJob:
    """"Stop Job" — spec v5 §6.4. Ends a Job early, distinct from Cancel:
    Stop is for a Job that already did some real work and needs to end
    now (order changed, material permanently unavailable, etc.), whereas
    Cancel voids a Job outright. Available only once a Job has actually
    started (RUNNING or PAUSED) — a Job that never started has nothing to
    stop; use Cancel instead. Frees the Work Centres immediately either
    way. `return_to_demand` also cancels the Plan Line, so the un-packed
    balance reopens as Unplanned demand on Packing Orders instead of
    sitting permanently "planned" against a Job that will never finish it.
    """
    if job.status not in (PackingJob.Status.IN_PROGRESS, PackingJob.Status.ON_HOLD):
        raise ValueError("Only a running or paused Job can be stopped.")

    with transaction.atomic():
        _release_job_allocations(job, cancel=True)
        job.status = PackingJob.Status.STOPPED
        job.save(update_fields=["status", "updated_at"])
        if return_to_demand:
            plan_line = job.plan_line
            plan_line.status = PackingPlanLine.Status.CANCELLED
            plan_line.save(update_fields=["status", "updated_at"])
        record_job_event(
            job,
            PackingJobEvent.EventType.STOP,
            user=user,
            reason=reason,
            remarks=remarks,
            details={"return_to_demand": return_to_demand},
        )
    return job


def reschedule_plan_line(
    plan_line: PackingPlanLine,
    *,
    new_date: date,
    shift: Shift,
    bay: Bay,
    quantity: int | None = None,
    user: Any = None,
) -> PackingPlanLine:
    """Moves a Plan Line's remaining work to a new Date/Shift/Bay. Per spec
    v5's action matrix, Reschedule works on a RUNNING Job too — same
    cascade as Pause/Stop/Complete (Work Centres freed) rather than
    blocking until the floor is stopped first.

    - If the Job is still open (not Completed/Cancelled/Stopped) and
      genuinely untouched (nothing packed, no allocation of any kind ever
      created), the same row is simply updated in place — same
      job_number, same plan_code, nothing new created.
    - Otherwise (Half Finished, Completed-with-a-shortfall, Stopped, or
      Cancelled with any or zero packed qty) the original Plan Line/Job
      are left exactly as they are — a truthful record of what actually
      happened on their original day, closed out via the same path as a
      manual Complete — and a *new* Plan Line is created for whatever
      balance is being carried forward, with the next `Part n` number.

    Raises `ValueError` for every business-rule violation (no Job yet,
    nothing left to carry, asking to carry more than the outstanding
    balance) — the view layer translates these into API-facing
    validation errors.
    """
    job = getattr(plan_line, "packing_job", None)
    if job is None:
        raise ValueError("This plan line has no Packing Job yet — nothing to reschedule.")

    balance = job.balance_qty
    untouched = job.processed_qty == 0 and not job.allocations.exists()
    still_open = job.status not in (
        PackingJob.Status.COMPLETED,
        PackingJob.Status.CANCELLED,
        PackingJob.Status.STOPPED,
    )

    if untouched and still_open:
        old = {"date": str(plan_line.date), "shift": shift.id, "bay": bay.id, "qty": job.target_qty}
        plan_line.date = new_date
        plan_line.shift = shift
        plan_line.bay = bay
        plan_line.save(update_fields=["date", "shift", "bay", "updated_at"])
        record_job_event(
            job,
            PackingJobEvent.EventType.RESCHEDULE,
            user=user,
            details={
                "old": old,
                "new": {"date": str(new_date), "shift": shift.id, "bay": bay.id, "qty": job.target_qty},
            },
        )
        return plan_line

    carry_qty = quantity if quantity is not None else balance
    if carry_qty <= 0:
        raise ValueError("There's no outstanding balance left to reschedule.")
    if carry_qty > balance:
        raise ValueError(f"Cannot reschedule more than the outstanding balance ({balance} pcs).")

    with transaction.atomic():
        _release_job_allocations(job, cancel=True)
        old = {
            "date": str(plan_line.date),
            "shift": plan_line.shift_id,
            "bay": plan_line.bay_id,
            "qty": balance,
        }
        if still_open:
            job.status = PackingJob.Status.COMPLETED
            job.save(update_fields=["status", "updated_at"])

        export_order_line = plan_line.export_order_line
        new_line = PackingPlanLine.objects.create(
            export_order_line=export_order_line,
            date=new_date,
            shift=shift,
            bay=bay,
            planned_qty=carry_qty,
            status=PackingPlanLine.Status.PLANNED,
            plan_code=generate_plan_code(export_order_line),
            organization=plan_line.organization,
        )
        record_job_event(
            job,
            PackingJobEvent.EventType.RESCHEDULE,
            user=user,
            details={
                "old": old,
                "new": {"date": str(new_date), "shift": shift.id, "bay": bay.id, "qty": carry_qty},
            },
        )
    return new_line


@dataclass
class MaterialRequirementRow:
    item: Item
    label: str
    required_qty: int
    uom_code: str


def material_requirements_for_job(job: PackingJob) -> list[MaterialRequirementRow]:
    """Product + packaging material requirements, derived from the job's
    target quantity and its packaging profile *snapshot* — never the live
    profile, never manually typed. Rounding follows the same
    `math.ceil`-per-container-level convention as
    `ExportOrderLine.required_pouches`/`required_cartons`.
    """
    line = job.plan_line.export_order_line
    rows: list[MaterialRequirementRow] = []

    if line.item is not None:
        rows.append(
            MaterialRequirementRow(
                item=line.item,
                label=f"{line.item.name} ({line.item.code})",
                required_qty=job.target_qty,
                uom_code="PC",
            )
        )

    pieces_per_pouch = job.pieces_per_pouch
    pouches_per_carton = job.pouches_per_carton
    required_pouches = math.ceil(job.target_qty / pieces_per_pouch) if pieces_per_pouch else None
    required_cartons = (
        math.ceil(required_pouches / pouches_per_carton)
        if required_pouches is not None and pouches_per_carton
        else None
    )

    if job.packaging_profile_version is not None:
        for material in job.packaging_profile_version.materials.select_related("item", "uom"):
            if material.level == material.Level.POUCH and required_pouches is not None:
                qty = required_pouches
            elif material.level == material.Level.CARTON and required_cartons is not None:
                qty = required_cartons
            else:
                continue
            rows.append(
                MaterialRequirementRow(
                    item=material.item,
                    label=f"{material.item.name} ({material.item.code})",
                    required_qty=math.ceil(float(material.quantity) * qty),
                    uom_code=material.uom.code,
                )
            )
    return rows


def get_execution_config(organization: Organization) -> PackingExecutionConfig:
    """The one recording-configuration row per organization — spec v2
    §2.5. Auto-created with the documented defaults on first read so a
    fresh organization never needs seed data before its floor screens work.
    """
    config, _ = PackingExecutionConfig.objects.get_or_create(organization=organization)
    return config


def resolve_active_schedule_version(
    shift: Shift, organization: Organization
) -> PackingRecordingScheduleVersion | None:
    """The `ACTIVE` recording-schedule version configured for this Shift,
    if any — `None` means this org hasn't set up timetable blocks for it
    yet, and interval recording falls back to the legacy rolling-clock
    window (see `expected_blocks_for_allocation`). Only ever called once,
    at `start_packing_shift` time, to snapshot onto the new `PackingShift`
    — never re-resolved later.
    """
    schedule = PackingRecordingSchedule.objects.filter(
        shift=shift, is_active=True, organization=organization
    ).first()
    if schedule is None:
        return None
    version = schedule.current_version()
    if version is None or version.status != PackingRecordingScheduleVersion.Status.ACTIVE:
        return None
    return version


def create_recording_schedule_draft(
    schedule: PackingRecordingSchedule,
) -> PackingRecordingScheduleVersion:
    """Adds a new DRAFT version to a schedule — copying the current
    version's blocks (if any) as a starting point, so editing an
    already-published schedule doesn't mean re-typing every block from
    scratch. The DRAFT is editable via `replace_schedule_blocks` until
    `activate_recording_schedule_version` locks it in.
    """
    current = schedule.current_version()
    next_number = (
        schedule.versions.aggregate(highest=Max("version_number"))["highest"] or 0
    ) + 1
    with transaction.atomic():
        draft = PackingRecordingScheduleVersion.objects.create(
            schedule=schedule,
            version_number=next_number,
            organization=schedule.organization,
            recording_mode=(
                current.recording_mode
                if current
                else PackingRecordingScheduleVersion.RecordingMode.FLEXIBLE
            ),
        )
        for block in current.blocks.all() if current else []:
            PackingRecordingBlock.objects.create(
                version=draft,
                sequence=block.sequence,
                from_time=block.from_time,
                to_time=block.to_time,
                is_active=block.is_active,
                organization=draft.organization,
            )
    return draft


def replace_schedule_blocks(
    version: PackingRecordingScheduleVersion, rows: list[dict[str, Any]]
) -> PackingRecordingScheduleVersion:
    """Whole-list-replace for a DRAFT version's blocks — same pattern as
    `apps.work_centres.WorkCentreCapability`'s own save flow. Only a DRAFT
    may be edited; an ACTIVE version is immutable once published (any
    `PackingShift` may already have snapshotted it).
    """
    if version.status != PackingRecordingScheduleVersion.Status.DRAFT:
        raise ValueError("Only a draft version's blocks can be edited.")
    with transaction.atomic():
        version.blocks.all().delete()
        for row in rows:
            PackingRecordingBlock.objects.create(version=version, organization=version.organization, **row)
    version.refresh_from_db()
    return version


def activate_recording_schedule_version(
    version: PackingRecordingScheduleVersion,
) -> PackingRecordingScheduleVersion:
    """Publishes a DRAFT version — archives whatever was previously ACTIVE
    for the same schedule, same convention as
    `apps.processes.ProcessDefinitionVersion.activate`. Requires at least
    one block; an empty schedule would make every allocation fall back to
    the legacy rolling window anyway, which is confusing to have "active."
    """
    if version.status != PackingRecordingScheduleVersion.Status.DRAFT:
        raise ValueError("Only a draft version can be activated.")
    if not version.blocks.exists():
        raise ValueError("Add at least one block before activating.")
    with transaction.atomic():
        version.schedule.versions.filter(
            status=PackingRecordingScheduleVersion.Status.ACTIVE
        ).update(status=PackingRecordingScheduleVersion.Status.ARCHIVED)
        version.status = PackingRecordingScheduleVersion.Status.ACTIVE
        version.save(update_fields=["status", "updated_at"])
    return version


def resolve_process_version_for_work_centre(work_centre: WorkCentre) -> ProcessDefinitionVersion | None:
    """The Sorting/Cleaning/Packing process this Work Centre should record
    against — the first process it's configured as capable of running,
    mirroring what the v1 Packing Entry screen resolved client-side. A
    Work Centre with more than one capability is out of scope for V1 (spec
    doesn't describe choosing between them); pick the first deterministically.
    """
    capability = work_centre.capabilities.select_related("process_definition").order_by("id").first()
    if capability is None:
        return None
    return capability.process_definition.current_version()


@transaction.atomic
def start_packing_shift(
    *,
    date_: date,
    shift: Shift,
    organization: Organization,
    work_centres: list[dict[str, Any]],
    user: Any,
) -> PackingShift:
    """Atomically starts (or re-confirms) today's shift: creates the
    `PackingShift` if needed, and for every selected Work Centre
    get-or-creates its `PackingWorkCentreSession` (snapshotting its
    current Bay) plus the given operator pair — spec v2 §2.1's "Start
    Shift creates one PackingWorkCentreSession for every selected Work
    Centre and snapshots operator assignments." `work_centres` is
    ``[{"work_centre": WorkCentre, "operator_ids": [id, id]}, ...]``.
    Calling this again for an already-running shift is safe: existing
    sessions are left alone (their allocations/history untouched), and any
    newly-selected Work Centre gets a fresh session.
    """
    packing_shift, created = PackingShift.objects.get_or_create(
        date=date_,
        shift=shift,
        organization=organization,
        defaults={"recording_schedule_version": resolve_active_schedule_version(shift, organization)},
    )
    if packing_shift.status != PackingShift.Status.RUNNING:
        packing_shift.status = PackingShift.Status.RUNNING
        packing_shift.started_at = timezone.now()
        packing_shift.started_by = user
        packing_shift.save(update_fields=["status", "started_at", "started_by", "updated_at"])

    for entry in work_centres:
        work_centre = entry["work_centre"]
        session, created = PackingWorkCentreSession.objects.get_or_create(
            packing_shift=packing_shift,
            work_centre=work_centre,
            defaults={
                "bay": work_centre.bay,
                "status": PackingWorkCentreSession.Status.IDLE,
                "started_at": timezone.now(),
                "organization": organization,
            },
        )
        if created:
            for employee in entry.get("operators", []):
                PackingWorkCentreSessionOperator.objects.create(
                    session=session, employee=employee, organization=organization
                )
    return packing_shift


@transaction.atomic
def stop_packing_shift(packing_shift: PackingShift, user: Any) -> PackingShift:
    packing_shift.status = PackingShift.Status.STOPPED
    packing_shift.stopped_at = timezone.now()
    packing_shift.stopped_by = user
    packing_shift.save(update_fields=["status", "stopped_at", "stopped_by", "updated_at"])
    packing_shift.work_centre_sessions.exclude(
        status=PackingWorkCentreSession.Status.STOPPED
    ).update(status=PackingWorkCentreSession.Status.STOPPED, stopped_at=timezone.now())
    return packing_shift


def downtime_minutes_for_interval(
    session: PackingWorkCentreSession, from_time: datetime, to_time: datetime
) -> int:
    """Minutes of this interval overlapped by a productive-time-stopping
    issue event — derived from event timestamps, never re-typed by the
    supervisor (spec v2 §2.8: "Downtime is derived from overlapping
    issue-event time, not retyped every hour."). Overlapping issue windows
    are merged first so double-reported/adjacent issues don't double-count.
    """
    events = session.issue_events.filter(
        Q(resolved_at__isnull=True) | Q(resolved_at__gt=from_time),
        stops_productive_time=True,
        started_at__lt=to_time,
    )
    intervals: list[tuple[datetime, datetime]] = []
    for event in events:
        start = max(event.started_at, from_time)
        end = min(event.resolved_at or timezone.now(), to_time)
        if end > start:
            intervals.append((start, end))
    intervals.sort()
    merged: list[list[datetime]] = []
    for start, end in intervals:
        if merged and start <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], end)
        else:
            merged.append([start, end])
    total = sum((end - start).total_seconds() for start, end in merged)
    return int(total // 60)


def compute_interval_minutes(
    session: PackingWorkCentreSession, from_time: datetime, to_time: datetime
) -> tuple[int, int, int]:
    """Returns (scheduled_minutes, downtime_minutes, available_minutes)."""
    scheduled = max(int((to_time - from_time).total_seconds() // 60), 0)
    downtime = min(downtime_minutes_for_interval(session, from_time, to_time), scheduled)
    available = max(scheduled - downtime, 0)
    return scheduled, downtime, available


def compute_planned_output(config: PackingExecutionConfig, standard_rate: Any, available_minutes: int) -> int:
    if config.plan_calculation != PackingExecutionConfig.PlanCalculation.STANDARD_RATE:
        return 0
    if not standard_rate:
        return 0
    return round(float(standard_rate) * available_minutes / 60)


def build_interval_execution_data(
    allocation: PackingWorkCentreAllocation,
    *,
    from_time: datetime,
    premium_qty: int,
    standard_qty: int,
    reject_qty: int,
) -> dict[str, Any]:
    """Maps one interval's Sorting/Cleaning/Packing quantities onto the
    generic `ProcessExecutionSerializer` payload shape, resolving output
    definitions by classification name so this stays correct for whatever
    outputs the org actually configured (spec v2 §1.4/§8: interval records
    reconcile to `ProcessExecution`, they don't replace it). One interval
    record = one `ProcessExecution` (confirmed mapping) — the batch/lot
    number is synthesized per-interval since a hand-typed one has no
    natural meaning at hourly granularity.
    """
    process_version = allocation.process_version
    if process_version is None:
        raise ValueError("This allocation has no resolved process yet — start it first.")

    session = allocation.session
    work_centre = session.work_centre
    quality_map = {"Good": premium_qty, "Standard": standard_qty}
    reject_names = {"Reject", "Scrap"}
    outputs_write = []
    for output in process_version.outputs.select_related("classification"):
        name = output.classification.name
        if name in quality_map:
            qty = quality_map[name]
        elif name in reject_names:
            qty = reject_qty
        else:
            continue
        outputs_write.append({"output_definition": output.id, "quantity": qty})

    total_processed = premium_qty + standard_qty + reject_qty
    inputs_write = [
        {"input_definition": input_def.id, "quantity": total_processed}
        for input_def in process_version.inputs.all()[:1]
    ]

    batch_lot_number = (
        f"{from_time:%Y%m%d}-{session.packing_shift.shift.code}-{work_centre.code}-{from_time:%H%M}"
    )
    employee_ids = list(session.operators.values_list("employee_id", flat=True))

    return {
        "process_version": process_version.id,
        "work_centre": work_centre.id,
        "date": from_time.date().isoformat(),
        "export_order_line": allocation.job.plan_line.export_order_line_id,
        "batch_lot_number": batch_lot_number,
        "employees": employee_ids,
        "inputs_write": inputs_write,
        "outputs_write": outputs_write,
        "remarks": "",
    }


def next_expected_interval(
    allocation: PackingWorkCentreAllocation, config: PackingExecutionConfig
) -> tuple[datetime, datetime]:
    """The next interval window a supervisor should record for this
    allocation — starts right after the last recorded interval's `to_time`,
    or at the allocation's own `started_at` for the first one. Auto-selects
    the expected open interval, per spec v2 §2.4: "The system should
    auto-select the expected open interval when Record Hour is clicked."
    """
    last = allocation.interval_records.order_by("-to_time").first()
    start = last.to_time if last else (allocation.started_at or timezone.now())
    end = start + timedelta(minutes=config.default_interval_minutes)
    return start, end


@dataclass
class ExpectedBlockRow:
    schedule_block_id: int | None
    display_label: str
    from_time: datetime
    to_time: datetime
    scheduled_minutes: int
    is_partial: bool


def expected_blocks_for_allocation(
    allocation: PackingWorkCentreAllocation, config: PackingExecutionConfig
) -> list[ExpectedBlockRow]:
    """Which schedule blocks a supervisor can record for this allocation
    right now — spec v5 §9.4/§9.5: only blocks that overlap this
    allocation's own active window are offered, and one already recorded
    for this allocation is left out (no correction-mode UI yet). A block
    only partially inside the allocation's window (e.g. the SKU changed
    mid-block) is clipped to the covered range — §9.6's partial-block
    support — unless `allow_partial_interval_on_sku_change` is off, in
    which case a block must be fully covered to be offered at all. Falls
    back to a single legacy rolling window when this shift has no
    recording schedule configured, so an org that hasn't set one up yet
    keeps working exactly as before.
    """
    session = allocation.session
    packing_shift = session.packing_shift
    version = packing_shift.recording_schedule_version

    if version is None:
        start, end = next_expected_interval(allocation, config)
        minutes = max(int((end - start).total_seconds() // 60), 0)
        return [ExpectedBlockRow(None, f"{start:%H:%M}–{end:%H:%M}", start, end, minutes, False)]

    if allocation.started_at is None:
        return []

    active_start = allocation.started_at
    active_end = allocation.completed_at  # None = still running, assumed to cover the full block

    recorded_block_ids = set(
        allocation.interval_records.exclude(schedule_block__isnull=True).values_list(
            "schedule_block_id", flat=True
        )
    )

    rows: list[ExpectedBlockRow] = []
    for block in version.blocks.filter(is_active=True).order_by("sequence"):
        if block.id in recorded_block_ids:
            continue
        block_start = timezone.make_aware(datetime.combine(packing_shift.date, block.from_time))
        block_end = timezone.make_aware(datetime.combine(packing_shift.date, block.to_time))
        covered_start = max(block_start, active_start)
        covered_end = min(block_end, active_end) if active_end else block_end
        if covered_start >= covered_end:
            continue
        is_partial = covered_start != block_start or covered_end != block_end
        if is_partial and not config.allow_partial_interval_on_sku_change:
            continue
        minutes = max(int((covered_end - covered_start).total_seconds() // 60), 0)
        rows.append(
            ExpectedBlockRow(
                block.id,
                f"B{block.sequence} • {block.from_time:%H:%M}-{block.to_time:%H:%M}",
                covered_start,
                covered_end,
                minutes,
                is_partial,
            )
        )
    return rows


def standard_rate_for_allocation(allocation: PackingWorkCentreAllocation) -> Any:
    """The standard rate snapshot to use for this allocation's next output
    record — resolved from the Work Centre's capability for the currently
    pinned process, same lookup the interval-recording path already does.
    """
    if allocation.process_version is None:
        return None
    capability = allocation.session.work_centre.capabilities.filter(
        process_definition=allocation.process_version.process_definition
    ).first()
    return capability.standard_rate if capability else None


def summary_covered_range(
    allocation: PackingWorkCentreAllocation, *, is_final_summary: bool
) -> tuple[datetime, datetime]:
    """The window a Summary record's Downtime/Available/Scheduled minutes
    are computed over — spec v5 §8.3. The default "unrecorded output only"
    radio starts right after whatever's already been recorded, so its
    minutes don't double-count an interval's; "final consolidated summary"
    covers the whole allocation, since it supersedes every earlier record.
    """
    end = allocation.completed_at or timezone.now()
    start = allocation.started_at or end
    if is_final_summary:
        return start, end
    last_record = allocation.interval_records.order_by("-to_time").first()
    if last_record and last_record.to_time > start:
        start = last_record.to_time
    return start, end


def entered_and_missing_block_labels(
    allocation: PackingWorkCentreAllocation,
) -> tuple[list[str], list[str]]:
    """Which schedule blocks already have an INTERVAL record vs. don't —
    Summary Entry's informational display (spec v5 §8.3: "Existing
    interval blocks entered: B1, B2 / Missing/unrecorded: B3, B4, B5").
    Empty on both sides when this shift has no recording schedule.
    """
    version = allocation.session.packing_shift.recording_schedule_version
    if version is None:
        return [], []
    entered_sequences = allocation.interval_records.filter(
        record_type=PackingIntervalRecord.RecordType.INTERVAL, schedule_block__isnull=False
    ).values_list("schedule_block__sequence", flat=True)
    config = get_execution_config(allocation.organization)
    missing_block_ids = {
        row.schedule_block_id
        for row in expected_blocks_for_allocation(allocation, config)
        if row.schedule_block_id is not None
    }
    missing_sequences = version.blocks.filter(id__in=missing_block_ids).values_list(
        "sequence", flat=True
    )
    return (
        [f"B{s}" for s in sorted(entered_sequences)],
        [f"B{s}" for s in sorted(missing_sequences)],
    )


def record_summary(
    allocation: PackingWorkCentreAllocation,
    *,
    is_final_summary: bool,
    premium_qty: int,
    standard_qty: int,
    reject_qty: int,
    cleaned_qty: int,
    pouches_packed: int,
    loose_pieces_packed: int,
    cartons_completed: int,
    remarks: str,
    user: Any,
) -> PackingIntervalRecord:
    """Record Summary — spec v5 §8.3. One consolidated output entry for an
    allocation, alongside (or instead of) its interval records. Reuses the
    same downtime/available/planned-output/`ProcessExecution` pipeline as
    an interval record so Summary and Interval totals are reported
    identically — the only real differences are which window it covers and
    that it has no `schedule_block`.
    """
    if allocation.process_version is None:
        raise ValueError("This Work Centre hasn't started yet — nothing to summarize.")

    from_time, to_time = summary_covered_range(allocation, is_final_summary=is_final_summary)
    session = allocation.session
    scheduled, downtime, available = compute_interval_minutes(session, from_time, to_time)

    config = get_execution_config(allocation.organization)
    standard_rate = standard_rate_for_allocation(allocation)
    planned_output = compute_planned_output(config, standard_rate, available)

    pieces_per_pouch = allocation.job.pieces_per_pouch or 0
    pieces_packed = pouches_packed * pieces_per_pouch + loose_pieces_packed

    execution_data = build_interval_execution_data(
        allocation,
        from_time=from_time,
        premium_qty=premium_qty,
        standard_qty=standard_qty,
        reject_qty=reject_qty,
    )
    exec_serializer = ProcessExecutionSerializer(data=execution_data)
    exec_serializer.is_valid(raise_exception=True)
    execution = exec_serializer.save(created_by=user, updated_by=user)

    return PackingIntervalRecord.objects.create(
        allocation=allocation,
        schedule_block=None,
        from_time=from_time,
        to_time=to_time,
        scheduled_minutes=scheduled,
        downtime_minutes=downtime,
        available_minutes=available,
        standard_rate_snapshot=standard_rate,
        planned_output=planned_output,
        premium_qty=premium_qty,
        standard_qty=standard_qty,
        reject_qty=reject_qty,
        cleaned_qty=cleaned_qty,
        pouches_packed=pouches_packed,
        loose_pieces_packed=loose_pieces_packed,
        pieces_packed=pieces_packed,
        cartons_completed=cartons_completed,
        record_type=PackingIntervalRecord.RecordType.SUMMARY,
        covers_unrecorded_only=not is_final_summary,
        is_final_summary=is_final_summary,
        status=PackingIntervalRecord.Status.ENTERED,
        entered_by=user,
        entered_at=timezone.now(),
        remarks=remarks,
        execution=execution,
        organization=allocation.organization,
        created_by=user,
        updated_by=user,
    )


@dataclass
class BulkSummaryRow:
    allocation: int
    is_final_summary: bool = False
    premium_qty: int = 0
    standard_qty: int = 0
    reject_qty: int = 0
    cleaned_qty: int = 0
    pouches_packed: int = 0
    loose_pieces_packed: int = 0
    cartons_completed: int = 0
    remarks: str = ""


@transaction.atomic
def bulk_record_summaries(
    job: PackingJob, rows: list[BulkSummaryRow], *, user: Any
) -> list[PackingIntervalRecord]:
    """Bulk Summary Entry — spec v5 §8.4: save several Work Centres' end-
    of-shift summaries in one action instead of forcing individual modal
    entry across 20+ Work Centres.
    """
    allocations = {
        a.id: a
        for a in job.allocations.select_related("session__work_centre", "job").filter(
            id__in=[row.allocation for row in rows]
        )
    }
    records = []
    for row in rows:
        allocation = allocations.get(row.allocation)
        if allocation is None:
            raise ValueError(f"Allocation {row.allocation} does not belong to this Job.")
        records.append(
            record_summary(
                allocation,
                is_final_summary=row.is_final_summary,
                premium_qty=row.premium_qty,
                standard_qty=row.standard_qty,
                reject_qty=row.reject_qty,
                cleaned_qty=row.cleaned_qty,
                pouches_packed=row.pouches_packed,
                loose_pieces_packed=row.loose_pieces_packed,
                cartons_completed=row.cartons_completed,
                remarks=row.remarks,
                user=user,
            )
        )
    return records
