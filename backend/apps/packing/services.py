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
from django.db.models import Q, Sum
from django.utils import timezone

from apps.core.models import Organization
from apps.export_orders.models import ExportOrderLine
from apps.items.models import Item
from apps.processes.models import ProcessDefinitionVersion
from apps.work_centres.models import WorkCentre

from .models import (
    PackingExecutionConfig,
    PackingJob,
    PackingPlanLine,
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
    packing_shift, _ = PackingShift.objects.get_or_create(
        date=date_, shift=shift, organization=organization
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
