from datetime import date as date_type
from typing import Any, cast

from django.db import transaction
from django.utils import timezone

from apps.core.models import Organization
from apps.export_orders.models import ExportOrderLine, PackingTransaction
from apps.items.models import Item
from apps.processes.models import (
    ProcessDefinitionVersion,
    ProcessExecution,
    ProcessExecutionInput,
    ProcessExecutionOutput,
    ProcessOutputDefinition,
)
from apps.product_routes_v1.models import ProcessRouteNodeV1
from apps.product_routes_v1.services import resolve_item
from apps.work_centres.models import WorkCentre

from .models import (
    BoxingRecord,
    PackingAllotment,
    PackingDayClosure,
    WorkCentreRecord,
    WorkCentreStatus,
)


def select_line_for_today(line: ExportOrderLine) -> PackingAllotment:
    """"Select" on All Orders. Reopens this line's existing Draft allotment
    if one's already staged (never more than one at a time — also
    enforced by a DB constraint), otherwise stages a fresh one for today
    at 0 cartons for the coordinator to fill in.
    """
    existing = PackingAllotment.objects.filter(
        export_order_line=line, status=PackingAllotment.Status.DRAFT
    ).first()
    if existing is not None:
        return existing
    return PackingAllotment.objects.create(
        export_order_line=line,
        date=timezone.localdate(),
        allotted_cartons=0,
        status=PackingAllotment.Status.DRAFT,
        organization=Organization.get_default(),
    )


def update_draft_quantity(allotment: PackingAllotment, *, cartons: int) -> PackingAllotment:
    if allotment.status != PackingAllotment.Status.DRAFT:
        raise ValueError("Only a staged (not yet released) allotment can be edited.")
    if cartons <= 0:
        raise ValueError("Enter a quantity greater than zero.")
    pending = allotment.export_order_line.packing_balance or 0
    if cartons > pending:
        raise ValueError(f"Cannot allot more than the outstanding balance ({pending} cartons).")
    allotment.allotted_cartons = cartons
    allotment.save(update_fields=["allotted_cartons", "updated_at"])
    return allotment


def remove_draft(allotment: PackingAllotment) -> None:
    if allotment.status != PackingAllotment.Status.DRAFT:
        raise ValueError("Only a staged (not yet released) allotment can be removed.")
    allotment.delete()


def blocking_unclosed_date() -> date_type | None:
    """The earliest date before today that has Released work but no
    `PackingDayClosure` — Release is refused while this isn't `None`.
    Only dates that actually had work released are considered, so a quiet
    day (nothing allotted) never needs an explicit close to unblock the
    next one.
    """
    today = timezone.localdate()
    released_dates = set(
        PackingAllotment.objects.filter(
            status=PackingAllotment.Status.RELEASED, date__lt=today
        ).values_list("date", flat=True)
    )
    if not released_dates:
        return None
    closed_dates = set(
        PackingDayClosure.objects.filter(date__in=released_dates).values_list("date", flat=True)
    )
    unclosed = sorted(released_dates - closed_dates)
    return unclosed[0] if unclosed else None


@transaction.atomic
def release_drafts(user: Any) -> list[PackingAllotment]:
    """"Release to Packing Floor" — commits every currently staged draft
    at once. Re-validates against each line's live balance rather than
    trusting what was true when it was staged (another release could have
    moved it since) — raises rather than silently skipping, so a stale
    draft doesn't quietly vanish from the batch; the coordinator fixes or
    removes it and tries again. Blocked entirely while an earlier date's
    work is still open — Select (staging) stays available regardless,
    only committing to the floor is gated (see `blocking_unclosed_date`).
    """
    blocking_date = blocking_unclosed_date()
    if blocking_date is not None:
        raise ValueError(f"{blocking_date} isn't closed yet — close it before releasing new work.")

    drafts = list(
        PackingAllotment.objects.filter(status=PackingAllotment.Status.DRAFT).select_related(
            "export_order_line"
        )
    )
    released = []
    for allotment in drafts:
        pending = allotment.export_order_line.packing_balance or 0
        if allotment.allotted_cartons <= 0 or allotment.allotted_cartons > pending:
            raise ValueError(
                f"{allotment.export_order_line.customer_sku_code}'s allotment "
                f"({allotment.allotted_cartons}) no longer fits its balance ({pending}) — "
                "fix or remove it before releasing."
            )
        allotment.status = PackingAllotment.Status.RELEASED
        allotment.released_at = timezone.now()
        allotment.updated_by = user if getattr(user, "is_authenticated", False) else None
        allotment.save(update_fields=["status", "released_at", "updated_by", "updated_at"])
        released.append(allotment)
    return released


def resolve_process_version_for_work_centre(work_centre: WorkCentre) -> ProcessDefinitionVersion | None:
    """The process this Work Centre should record against — the first
    process it's configured as capable of running. Duplicated from
    `apps.packing.services` (same reasoning as `permissions.py`) rather
    than importing across modules — this one intentionally has no
    dependency on that module's Bay/Shift/Session machinery, only on
    shared `work_centres`/`processes` master data.
    """
    capability = work_centre.capabilities.select_related("process_definition").order_by("id").first()
    if capability is None:
        return None
    return capability.process_definition.current_version()


def resolve_route_node_for_work_centre(work_centre: WorkCentre) -> ProcessRouteNodeV1 | None:
    """Which `apps.product_routes_v1` route step this Work Centre performs,
    if it's been migrated to the generic engine — see
    `models.WorkCentreRouteNodeV1`'s docstring. `None` means "not migrated
    yet," and callers should skip generic-engine validation entirely,
    leaving today's recording behavior completely unchanged.
    """
    link = getattr(work_centre, "packing_lite_route_node_v1", None)
    return link.route_node if link else None


def _validate_against_generic_engine(
    work_centre: WorkCentre,
    target_item: Item | None,
    *,
    input_quantity: int,
    output_quantities: dict[str, int],
) -> None:
    """The actual "wire the resolver in" piece. A Work Centre migrated to
    the generic engine (see `resolve_route_node_for_work_centre`)
    additionally confirms the Job's real SKU (`target_item`) resolves
    through every input/output classification it's about to record, via
    `apps.product_routes_v1.services.resolve_item` — before the entry is
    accepted, never after. A Work Centre with no such link is untouched:
    this is a no-op, keeping today's behavior exactly as it is. Output
    roles are matched by `OutputClassification` name (Good/Standard/
    Scrap), the same key `record_work_centre_output` already uses against
    the old engine — nothing here is persisted, a `ValueError` means "this
    SKU hasn't been mapped in the generic engine yet," not a bug.
    """
    route_node = resolve_route_node_for_work_centre(work_centre)
    if route_node is None:
        return
    if target_item is None:
        raise ValueError(
            f"This Job's export order line has no item set — {work_centre.code}'s generic "
            "process can't resolve a mapping without one."
        )

    process_version = (
        route_node.process_definition_version or route_node.process_definition.current_version()
    )
    if process_version is None:
        raise ValueError(f"{work_centre.code}'s generic process has no active configuration.")

    try:
        if input_quantity > 0:
            input_def = process_version.inputs.first()
            if input_def is not None:
                resolve_item(
                    route_node.route_version, route_node, target_item, input_definition=input_def
                )
        for name, quantity in output_quantities.items():
            if quantity <= 0:
                continue
            output_def = process_version.outputs.filter(classification__name=name).first()
            if output_def is not None:
                resolve_item(
                    route_node.route_version, route_node, target_item, output_definition=output_def
                )
    except ValueError as exc:
        raise ValueError(
            f"{target_item.name} isn't mapped for {work_centre.code}'s generic process yet — "
            f"configure it in the route's Item Mappings ({exc})."
        ) from exc


@transaction.atomic
def record_work_centre_output(
    *,
    allotment: PackingAllotment,
    work_centre: WorkCentre,
    packed_plates: int,
    pouches_packed: int,
    downgraded: int,
    rejected: int,
    employee_ids: list[int],
    user: Any,
) -> WorkCentreRecord:
    """"Add Records" — one end-of-day entry for a Work Centre against one
    allotted Job. Good/Standard/Scrap become real `ProcessExecutionOutput`
    rows against the Work Centre's own configured process; raw material
    consumed is taken as the sum of the three (this process has no
    separate loss factor beyond what's already classified as Scrap).
    """
    if PackingDayClosure.objects.filter(date=allotment.date).exists():
        raise ValueError(f"{allotment.date} is already closed — no more records can be added to it.")

    version = resolve_process_version_for_work_centre(work_centre)
    if version is None:
        raise ValueError(f"{work_centre.code} has no process configured to record against.")

    found_defs = {
        name: version.outputs.filter(classification__name=name).first()
        for name in ("Good", "Standard", "Scrap")
    }
    missing = [name for name, definition in found_defs.items() if definition is None]
    if missing:
        raise ValueError(
            f"{work_centre.code}'s process is missing a {'/'.join(missing)} output "
            "— check its configuration in Settings."
        )
    output_defs = cast(dict[str, ProcessOutputDefinition], found_defs)
    input_def = version.inputs.first()
    if input_def is None:
        raise ValueError(f"{work_centre.code}'s process has no input configured.")

    total = packed_plates + downgraded + rejected
    if total <= 0:
        raise ValueError("Enter at least one quantity greater than zero.")

    _validate_against_generic_engine(
        work_centre,
        allotment.export_order_line.item,
        input_quantity=total,
        output_quantities={"Good": packed_plates, "Standard": downgraded, "Scrap": rejected},
    )

    organization = Organization.get_default()
    created_by = user if getattr(user, "is_authenticated", False) else None
    execution = ProcessExecution.objects.create(
        process_version=version,
        work_centre=work_centre,
        export_order_line=allotment.export_order_line,
        date=timezone.localdate(),
        organization=organization,
        created_by=created_by,
    )
    if employee_ids:
        execution.employees.set(employee_ids)
    ProcessExecutionInput.objects.create(
        execution=execution,
        input_definition=input_def,
        quantity=total,
        organization=organization,
        created_by=created_by,
    )
    for name, quantity in (("Good", packed_plates), ("Standard", downgraded), ("Scrap", rejected)):
        if quantity > 0:
            ProcessExecutionOutput.objects.create(
                execution=execution,
                output_definition=output_defs[name],
                quantity=quantity,
                organization=organization,
                created_by=created_by,
            )
    return WorkCentreRecord.objects.create(
        allotment=allotment,
        execution=execution,
        pouches_packed=pouches_packed,
        organization=organization,
        created_by=created_by,
    )


@transaction.atomic
def record_boxing_output(
    *,
    allotment: PackingAllotment,
    work_centre: WorkCentre,
    boxes_packed: int,
    employee_ids: list[int],
    user: Any,
) -> BoxingRecord:
    """"Add Boxing Record" — one end-of-day entry for a Boxing Work Centre
    against one allotted Job: pouches in, cartons out. Same wrapping
    approach as `record_work_centre_output`, but reads whichever single
    input/output the Work Centre's configured process actually defines
    instead of requiring the Good/Standard/Scrap shape a packing process
    has — a Boxing process set up in Settings typically has just one of
    each. Input quantity is set equal to the box count (same "no separate
    loss factor" simplification `record_work_centre_output` makes, and
    same "capture only for now" spirit — pouches actually consumed isn't
    tracked precisely yet).
    """
    if PackingDayClosure.objects.filter(date=allotment.date).exists():
        raise ValueError(f"{allotment.date} is already closed — no more records can be added to it.")
    if boxes_packed <= 0:
        raise ValueError("Enter a quantity greater than zero.")

    version = resolve_process_version_for_work_centre(work_centre)
    if version is None:
        raise ValueError(f"{work_centre.code} has no process configured to record against.")
    output_def = version.outputs.first()
    if output_def is None:
        raise ValueError(f"{work_centre.code}'s process has no output configured.")
    input_def = version.inputs.first()
    if input_def is None:
        raise ValueError(f"{work_centre.code}'s process has no input configured.")

    _validate_against_generic_engine(
        work_centre,
        allotment.export_order_line.item,
        input_quantity=boxes_packed,
        output_quantities={"Good": boxes_packed},
    )

    organization = Organization.get_default()
    created_by = user if getattr(user, "is_authenticated", False) else None
    execution = ProcessExecution.objects.create(
        process_version=version,
        work_centre=work_centre,
        export_order_line=allotment.export_order_line,
        date=timezone.localdate(),
        organization=organization,
        created_by=created_by,
    )
    if employee_ids:
        execution.employees.set(employee_ids)
    ProcessExecutionInput.objects.create(
        execution=execution,
        input_definition=input_def,
        quantity=boxes_packed,
        organization=organization,
        created_by=created_by,
    )
    ProcessExecutionOutput.objects.create(
        execution=execution,
        output_definition=output_def,
        quantity=boxes_packed,
        organization=organization,
        created_by=created_by,
    )
    return BoxingRecord.objects.create(
        allotment=allotment,
        execution=execution,
        organization=organization,
        created_by=created_by,
    )


def boxing_summary_for_allotment(allotment: PackingAllotment) -> dict[str, int | None]:
    """Pouches recorded vs. boxes recorded for one allotment, plus what the
    box count "should" be given the line's own `pouches_per_carton` — the
    soft-warning reconciliation surfaced on Close (see `close_pending_day`)
    and the Close review screen (`views.DayReconciliationView`). `None`
    fields mean "not enough data to judge" (no `pouches_per_carton` on the
    line), not "no discrepancy" — never treated as a match.
    """
    pouches_packed = sum(r.pouches_packed for r in allotment.work_centre_records.all())
    boxes_packed = sum(r.execution.total_output_quantity for r in allotment.boxing_records.all())
    per_carton = allotment.export_order_line.pouches_per_carton
    expected_boxes = pouches_packed // per_carton if per_carton else None
    discrepancy = boxes_packed - expected_boxes if expected_boxes is not None else None
    return {
        "pouches_packed": pouches_packed,
        "boxes_packed": boxes_packed,
        "expected_boxes": expected_boxes,
        "boxing_discrepancy": discrepancy,
    }


def set_work_centre_status(work_centre: WorkCentre, *, status: str, user: Any) -> WorkCentreStatus:
    if status not in WorkCentreStatus.Status.values:
        raise ValueError(f"'{status}' isn't a valid status.")
    record, _ = WorkCentreStatus.objects.update_or_create(
        work_centre=work_centre,
        defaults={
            "status": status,
            "organization": Organization.get_default(),
            "updated_by": user if getattr(user, "is_authenticated", False) else None,
        },
    )
    return record


def recorded_plates_for_allotment(allotment: PackingAllotment) -> int:
    """Everything actually recorded against this allotment so far today —
    Good + Standard + Scrap combined, across every `WorkCentreRecord`
    logged for it. Compared against its `allotted_cartons` (converted to
    plates) at Close time to surface a shortfall/overage, never stored.
    """
    return sum(
        record.execution.total_output_quantity for record in allotment.work_centre_records.all()
    )


def date_to_close() -> date_type:
    """Whichever date "Close" should act on next — the earliest overdue
    date with released work if one was missed (see
    `blocking_unclosed_date`), otherwise today. Means a missed day is
    always recoverable through this same screen rather than a permanent
    dead end: closing works through the backlog one date at a time before
    ever landing back on today.
    """
    blocking = blocking_unclosed_date()
    return blocking if blocking is not None else timezone.localdate()


@transaction.atomic
def close_pending_day(user: Any) -> PackingDayClosure:
    """"Close Today's Work" — ends whichever date `date_to_close` targets.
    Nothing about that date's own records changes; this just stamps it as
    closed, which is what `record_work_centre_output`/`record_boxing_
    output`/`release_drafts` check against afterward. Also takes the
    pouches-vs-boxes reconciliation snapshot (see `boxing_summary_for_
    allotment`) — a soft warning, so a discrepancy never blocks closing,
    just gets permanently logged for later analysis.

    This is also the one moment a Job's Boxing output becomes visible
    outside this module: for every allotment with boxes recorded, this
    posts a real `export_orders.PackingTransaction` (`CARTON_COMPLETED`,
    same entry type the Export Orders team already logs manually) for the
    box count — the same shared ledger `ExportOrderLine.packed_cartons`/
    `packing_balance`/`last_packing_transaction_at` already read, so
    customer-facing progress updates the instant a day closes, with no
    separate sync step. Plate/pouch output never posts here — only real
    cartons do, and Boxing is the only step that produces those.
    """
    target = date_to_close()
    if PackingDayClosure.objects.filter(date=target).exists():
        raise ValueError(f"{target} is already closed.")
    allotments = (
        PackingAllotment.objects.filter(status=PackingAllotment.Status.RELEASED, date=target)
        .select_related("export_order_line__export_order")
        .prefetch_related("work_centre_records", "boxing_records__execution__outputs")
    )
    organization = Organization.get_default()
    created_by = user if getattr(user, "is_authenticated", False) else None
    snapshot = []
    for allotment in allotments:
        summary = boxing_summary_for_allotment(allotment)
        snapshot.append(
            {
                "allotment_id": allotment.id,
                "order_no": allotment.export_order_line.export_order.order_number,
                "customer_sku_code": allotment.export_order_line.customer_sku_code,
                **summary,
            }
        )
        boxes_packed = summary["boxes_packed"]
        if boxes_packed:
            PackingTransaction.objects.create(
                export_order_line=allotment.export_order_line,
                date=target,
                entry_type=PackingTransaction.EntryType.CARTON_COMPLETED,
                cartons_packed=boxes_packed,
                remarks="Boxing — recorded via the Packing module.",
                created_by=created_by,
            )
    return PackingDayClosure.objects.create(
        date=target,
        boxing_reconciliation=snapshot,
        organization=organization,
        created_by=created_by,
    )
