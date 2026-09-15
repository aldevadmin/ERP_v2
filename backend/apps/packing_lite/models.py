from django.db import models

from apps.core.models import BaseModel


class PackingLineFlag(BaseModel):
    """Per-Export-Order-Line workflow state owned by the fresh Packing
    rebuild — kept separate from `export_orders.ExportOrderLine` itself
    (that's core order data, not a packing workflow concern) and separate
    from `apps.packing`'s own models (that module tracks packing progress
    through its own Bay/Shift/Work-Centre/Job machinery; this one doesn't
    use any of it — see the module's docs for why).

    Required/packed/pending quantities are never duplicated here — they
    stay live properties on `ExportOrderLine` (`required_cartons`,
    `packed_cartons`, ...), fed by `export_orders.PackingTransaction`. The
    one thing that's new is a line manually put On Hold (a customer or
    factory-side issue), which overrides the otherwise-automatic
    Backlog/In Progress/Completed status derived from those quantities.
    """

    export_order_line = models.OneToOneField(
        "export_orders.ExportOrderLine",
        on_delete=models.CASCADE,
        related_name="packing_lite_flag",
    )
    is_on_hold = models.BooleanField(default=False)
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="packing_lite_line_flags"
    )

    def __str__(self) -> str:
        return f"{self.export_order_line} — {'On Hold' if self.is_on_hold else 'Active'}"


class PackingAllotment(BaseModel):
    """"How much of a line are we attempting today" — a lightweight work
    order, deliberately decoupled from actual progress. `DRAFT` rows are
    the "Orders Selected" staging list (one line's "Select" click stages
    or reopens its own draft — see `services.select_line_for_today`);
    `RELEASED` rows are what Today's Work reads. Never marked complete or
    short: Today's Work compares an allotment's `allotted_cartons` against
    that same day's `export_orders.PackingTransaction` entries for the
    line to see actual progress, live, rather than this row tracking it —
    same "derive, don't duplicate" rule as everything else this module
    reads off `ExportOrderLine`. A line may end up with several `RELEASED`
    rows on the same date (e.g. 50 cartons allotted this morning, 30 more
    added later) — deliberately not unique per (line, date), each Select
    → Release is its own independent commitment.
    """

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        RELEASED = "RELEASED", "Released"

    export_order_line = models.ForeignKey(
        "export_orders.ExportOrderLine",
        on_delete=models.CASCADE,
        related_name="packing_lite_allotments",
    )
    date = models.DateField()
    allotted_cartons = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    released_at = models.DateTimeField(null=True, blank=True)
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="packing_lite_allotments"
    )

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            # At most one open draft per line at a time — a second Select
            # reopens it instead of staging a duplicate (see
            # `services.select_line_for_today`).
            models.UniqueConstraint(
                fields=["export_order_line"],
                condition=models.Q(status="DRAFT"),
                name="unique_draft_allotment_per_line",
            )
        ]

    def __str__(self) -> str:
        return f"{self.export_order_line} — {self.allotted_cartons} cartons ({self.status})"


class WorkCentreRecord(BaseModel):
    """One "Add Records" entry — an end-of-day capture of what a Work
    Centre produced against one allotted Job. Wraps a real
    `apps.processes.ProcessExecution` on the Work Centre's own configured
    process (see `services.resolve_process_version_for_work_centre`)
    rather than inventing separate output tracking: Good/Standard/Scrap
    become real classified `ProcessExecutionOutput` rows against real
    output items, the same mechanism `apps.packing`'s own interval/summary
    recording sits on top of — just without any of that module's Bay/
    Shift/Session scheduling. `pouches_packed` is the one figure with no
    home in that process (plate-to-pouch is this process's own endpoint;
    pouch-to-box is a separate, later process not built yet) — captured
    directly here, typed in manually for now.
    """

    allotment = models.ForeignKey(
        PackingAllotment, on_delete=models.CASCADE, related_name="work_centre_records"
    )
    execution = models.OneToOneField(
        "processes.ProcessExecution", on_delete=models.CASCADE, related_name="packing_lite_record"
    )
    pouches_packed = models.PositiveIntegerField(default=0)
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="packing_lite_work_centre_records"
    )

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.execution.work_centre} — {self.allotment}"


class BoxingRecord(BaseModel):
    """One "Add Boxing Record" entry — mirrors `WorkCentreRecord` but for
    the Boxing step: pouches in, cartons/boxes out. Wraps a real
    `apps.processes.ProcessExecution` the same way, on whatever process the
    Work Centre is configured with in Settings (see
    `services.record_boxing_output`) — a Boxing process typically has just
    one input and one output, so nothing here hardcodes Good/Standard/
    Scrap the way `WorkCentreRecord` does. The box count itself is simply
    that execution's own `total_output_quantity`, never duplicated here.
    """

    allotment = models.ForeignKey(
        PackingAllotment, on_delete=models.CASCADE, related_name="boxing_records"
    )
    execution = models.OneToOneField(
        "processes.ProcessExecution",
        on_delete=models.CASCADE,
        related_name="packing_lite_boxing_record",
    )
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="packing_lite_boxing_records"
    )

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.execution.work_centre} — {self.allotment} (Boxing)"


class WorkCentreStatus(BaseModel):
    """Manual Running/Down flag for a Work Centre, owned by this module —
    not the same thing as `work_centres.WorkCentre.is_active` (whether
    the station is configured/available at all). Independent of both the
    persistent Session/Allocation state `apps.packing` tracks and of
    operator assignment (this module doesn't keep a standing operator
    roster per Work Centre at all — see `AddWorkCentreRecordModal`, which
    picks operators fresh each entry). A coordinator sets this directly;
    it's never derived. Lazily created — absence of a row means Running,
    the default state, same "no row = default" pattern as
    `PackingLineFlag`.
    """

    class Status(models.TextChoices):
        RUNNING = "RUNNING", "Running"
        DOWN = "DOWN", "Down"

    work_centre = models.OneToOneField(
        "work_centres.WorkCentre", on_delete=models.CASCADE, related_name="packing_lite_status"
    )
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.RUNNING)
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="packing_lite_work_centre_statuses"
    )

    def __str__(self) -> str:
        return f"{self.work_centre.code} — {self.status}"


class WorkCentreRouteNodeV1(BaseModel):
    """Which `apps.product_routes_v1` route step this Work Centre performs
    — lazily configured, same "no row = not migrated yet" pattern as
    `WorkCentreStatus`. A Work Centre without one keeps recording exactly
    as it does today, entirely through its `apps.processes.
    WorkCentreProcessCapability` — nothing here replaces that, since the
    generic engine has no execution/recording layer of its own yet (see
    `apps.product_routes_v1`'s docs). Where this link exists,
    `services.record_work_centre_output`/`record_boxing_output`
    additionally resolve the Job's real SKU through
    `apps.product_routes_v1.services.resolve_item` before accepting the
    entry — a pass/fail validation gate confirming the SKU has actually
    been mapped in the generic engine, never persisted anywhere.
    """

    work_centre = models.OneToOneField(
        "work_centres.WorkCentre", on_delete=models.CASCADE, related_name="packing_lite_route_node_v1"
    )
    route_node = models.ForeignKey(
        "product_routes_v1.ProcessRouteNodeV1", on_delete=models.PROTECT, related_name="+"
    )
    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.PROTECT,
        related_name="packing_lite_work_centre_route_nodes_v1",
    )

    def __str__(self) -> str:
        return f"{self.work_centre.code} -> {self.route_node}"


class PackingDayClosure(BaseModel):
    """Marks one date's Today's Work as closed — "Today's Work" is meant
    to end that day, not stay open indefinitely. Once a row exists for a
    date: no more `WorkCentreRecord`s can be added against it (see
    `services.record_work_centre_output`), and no *new* work can be
    Released for a later date until every earlier date with released work
    has its own closure row (see `services.blocking_unclosed_date`) —
    Select (staging a draft) stays unaffected, only committing to the
    floor is gated. `created_at`/`created_by` already double as "closed
    at"/"closed by", so there's nothing else to store here.
    """

    date = models.DateField(unique=True)
    # A permanent snapshot of that date's pouches-vs-boxes reconciliation,
    # taken at the moment of closing (see `services.close_pending_day`) —
    # a soft warning, never blocking, but worth keeping as a log to
    # analyse discrepancies later rather than only ever showing it live.
    # One dict per Job released that date; shape is whatever
    # `services.boxing_summary_for_allotment` returns, plus identifying
    # fields. Empty for any date closed before Boxing existed.
    boxing_reconciliation = models.JSONField(default=list, blank=True)
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="packing_day_closures"
    )

    def __str__(self) -> str:
        return f"Closed: {self.date}"
