"""Service functions for the Packing module — kept out of views.py/models.py
so each business rule lives in one obvious, greppable place (per this
project's "Backend owns business logic" principle), matching the pattern
already used by `apps.tooling.services` etc.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from django.db import transaction
from django.db.models import Sum

from apps.core.models import Sequence
from apps.export_orders.models import ExportOrderLine
from apps.items.models import Item

from .models import PackingJob, PackingPlanLine, PackingWorkCentreAllocation


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
    import math

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


def auto_allocate_equal(job: PackingJob, work_centre_ids: list[int], date_: date, shift_id: int) -> list[dict]:
    """Preview-only helper for the "Equal" auto-allocation method (spec
    §3.9) — splits the job's remaining balance evenly across the given
    Work Centres, largest-remainder rounding so the parts always sum back
    to the exact total. Returns plain dicts (not saved rows) so the
    caller/view can show a preview before the user applies it.
    """
    remaining = job.target_qty - job.allocated_qty
    count = len(work_centre_ids)
    if count == 0 or remaining <= 0:
        return []

    base = remaining // count
    extra = remaining % count
    rows = []
    for index, wc_id in enumerate(work_centre_ids):
        qty = base + (1 if index < extra else 0)
        if qty <= 0:
            continue
        rows.append(
            {
                "work_centre": wc_id,
                "date": date_,
                "shift": shift_id,
                "sequence": 1,
                "assigned_qty": qty,
            }
        )
    return rows
