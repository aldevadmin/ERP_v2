from django.conf import settings
from django.db import models
from django.db.models import Sum

from apps.core.models import BaseModel


class Shift(BaseModel):
    """A bare lookup for the packing floor's shifts (e.g. "Shift 1",
    "Shift 2") — same shape as `apps.processes.ProcessCategory`. Lives
    here rather than a more central app since Packing is the first module
    to need shift-based planning; extend/relocate if Production needs the
    same concept later.
    """

    name = models.CharField(max_length=50, unique=True)
    code = models.CharField(max_length=20, unique=True)
    start_time = models.TimeField(null=True, blank=True)
    end_time = models.TimeField(null=True, blank=True)
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="shifts"
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class PackingPlanLine(BaseModel):
    """The weekly planning unit: Export Order SKU Line + Date + Shift +
    Bay + Planned Quantity. The same `export_order_line` may have several
    plan lines across different dates/shifts/bays — a full SKU quantity is
    routinely split (see spec §3.2/§3.3), so this is deliberately not
    unique per line. Unchanged by the v2 execution-model revision.
    """

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        PLANNED = "PLANNED", "Planned"
        RELEASED = "RELEASED", "Released"
        CANCELLED = "CANCELLED", "Cancelled"

    export_order_line = models.ForeignKey(
        "export_orders.ExportOrderLine", on_delete=models.CASCADE, related_name="packing_plan_lines"
    )
    plan_code = models.CharField(max_length=80, editable=False, blank=True)
    date = models.DateField()
    shift = models.ForeignKey(Shift, on_delete=models.PROTECT, related_name="packing_plan_lines")
    bay = models.ForeignKey(
        "work_centres.Bay", on_delete=models.PROTECT, related_name="packing_plan_lines"
    )
    planned_qty = models.PositiveIntegerField()
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    remarks = models.TextField(blank=True)
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="packing_plan_lines"
    )

    class Meta:
        ordering = ["date", "bay__name"]

    def __str__(self) -> str:
        return self.plan_code or f"{self.export_order_line} — {self.date} {self.shift.code} {self.bay.code}"

    @property
    def job(self) -> "PackingJob | None":
        return getattr(self, "packing_job", None)


class PackingJob(BaseModel):
    """The operational unit released from a `PackingPlanLine` — one
    idempotent job per plan line (see
    `apps.packing.services.get_or_create_job_for_plan_line`).
    `packaging_profile_version`/`pieces_per_pouch`/`pouches_per_carton` are
    a snapshot resolved at creation time, same reasoning as
    `ExportOrderLine`'s own packing-config snapshot fields: a later edit to
    the master Packaging Profile must never reinterpret an already-running
    job's material/output calculations. Unchanged by the v2 execution-model
    revision — a Job still anchors material requirements and target
    quantity; only *how* Work Centres execute against it (§ below) changed.
    """

    class Status(models.TextChoices):
        AWAITING_MATERIAL = "AWAITING_MATERIAL", "Awaiting Material"
        READY = "READY", "Ready"
        IN_PROGRESS = "IN_PROGRESS", "In Progress"
        COMPLETED = "COMPLETED", "Completed"
        ON_HOLD = "ON_HOLD", "On Hold"
        CANCELLED = "CANCELLED", "Cancelled"

    plan_line = models.OneToOneField(
        PackingPlanLine, on_delete=models.CASCADE, related_name="packing_job"
    )
    job_number = models.CharField(max_length=32, unique=True, editable=False)
    target_qty = models.PositiveIntegerField()
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.AWAITING_MATERIAL
    )
    packaging_profile_version = models.ForeignKey(
        "packaging.PackagingProfileVersion",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="+",
    )
    pieces_per_pouch = models.PositiveIntegerField(null=True, blank=True, editable=False)
    pouches_per_carton = models.PositiveIntegerField(null=True, blank=True, editable=False)
    remarks = models.TextField(blank=True)
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="packing_jobs"
    )

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.job_number

    @property
    def pieces_per_carton(self) -> int | None:
        if self.pieces_per_pouch is None or self.pouches_per_carton is None:
            return None
        return self.pieces_per_pouch * self.pouches_per_carton

    @property
    def packed_qty(self) -> int:
        """Good-classified output from every interval record recorded
        against this job's allocations — see
        `ProcessExecutionOutput`/`OutputClassification` in `apps.processes`.
        Never stored: always a live aggregate over the execution ledger,
        same "derive, don't duplicate" rule as `ExportOrderLine.packed_pieces`.
        """
        from apps.processes.models import ProcessExecutionOutput

        return (
            ProcessExecutionOutput.objects.filter(
                execution__packing_interval_record__allocation__job=self,
                output_definition__classification__name="Good",
            ).aggregate(total=Sum("quantity"))["total"]
            or 0
        )

    @property
    def standard_qty(self) -> int:
        from apps.processes.models import ProcessExecutionOutput

        return (
            ProcessExecutionOutput.objects.filter(
                execution__packing_interval_record__allocation__job=self,
                output_definition__classification__name="Standard",
            ).aggregate(total=Sum("quantity"))["total"]
            or 0
        )

    @property
    def reject_qty(self) -> int:
        from apps.processes.models import ProcessExecutionOutput

        return (
            ProcessExecutionOutput.objects.filter(
                execution__packing_interval_record__allocation__job=self,
                output_definition__classification__name__in=["Reject", "Scrap"],
            ).aggregate(total=Sum("quantity"))["total"]
            or 0
        )

    @property
    def processed_qty(self) -> int:
        """Total output recorded against this job across every
        classification (Good + Standard + Reject/Scrap combined) — how much
        of the assigned raw material has actually been worked, regardless
        of how it was graded. This is what `balance_qty`/job-completion is
        based on: a job is done once its material has been fully processed,
        not once it has yielded `target_qty` worth of Good output (yield is
        never 100%, so gating completion on Good-only would leave a
        permanent phantom balance).
        """
        from apps.processes.models import ProcessExecutionOutput

        return (
            ProcessExecutionOutput.objects.filter(
                execution__packing_interval_record__allocation__job=self,
            ).aggregate(total=Sum("quantity"))["total"]
            or 0
        )

    @property
    def balance_qty(self) -> int:
        return max(self.target_qty - self.processed_qty, 0)

    @property
    def allocated_qty(self) -> int:
        return (
            self.allocations.exclude(status=PackingWorkCentreAllocation.Status.CANCELLED).aggregate(
                total=Sum("assigned_qty")
            )["total"]
            or 0
        )


class PackingMaterialRequest(BaseModel):
    """One warehouse request for a `PackingJob` — the anchor
    `PackingMaterialRequestLine` rows attach to. `status` is a computed
    property (like `ProductionRequirement.status`), rolled up from every
    line's own computed status, never stored — can't drift out of sync
    with its lines.
    """

    job = models.ForeignKey(PackingJob, on_delete=models.CASCADE, related_name="material_requests")
    source_location = models.ForeignKey(
        "product_routes.StorageLocation", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    required_by = models.DateField(null=True, blank=True)
    remarks = models.TextField(blank=True)
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="packing_material_requests"
    )

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"Material request for {self.job.job_number}"

    @property
    def status(self) -> str:
        statuses = [line.status for line in self.lines.all()]
        if not statuses:
            return PackingMaterialRequestLine.Status.DRAFT
        if all(s == PackingMaterialRequestLine.Status.RECEIVED for s in statuses):
            return PackingMaterialRequestLine.Status.RECEIVED
        if any(
            s
            in (
                PackingMaterialRequestLine.Status.PART_RECEIVED,
                PackingMaterialRequestLine.Status.RECEIVED,
                PackingMaterialRequestLine.Status.PART_ISSUED,
                PackingMaterialRequestLine.Status.ISSUED,
            )
            for s in statuses
        ):
            return PackingMaterialRequestLine.Status.PART_ISSUED
        return PackingMaterialRequestLine.Status.REQUESTED


class PackingMaterialRequestLine(BaseModel):
    """One item on a `PackingMaterialRequest`. `issued_qty`/`received_qty`
    are computed sums over `PackingMaterialMovement`, not stored fields —
    same "thin anchor + append-only ledger" pattern as
    `ProductionRequirement`/`ProductionTransaction` — so a request line can
    be fulfilled in more than one hand-off without the running totals ever
    disagreeing with the movement history.
    """

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        REQUESTED = "REQUESTED", "Requested"
        PART_ISSUED = "PART_ISSUED", "Partially Issued"
        ISSUED = "ISSUED", "Issued"
        PART_RECEIVED = "PART_RECEIVED", "Partially Received"
        RECEIVED = "RECEIVED", "Received"
        CANCELLED = "CANCELLED", "Cancelled"

    request = models.ForeignKey(
        PackingMaterialRequest, on_delete=models.CASCADE, related_name="lines"
    )
    item = models.ForeignKey("items.Item", on_delete=models.PROTECT, related_name="+")
    uom = models.CharField(max_length=20)
    required_qty = models.PositiveIntegerField()
    requested_qty = models.PositiveIntegerField()
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="packing_material_request_lines"
    )

    class Meta:
        ordering = ["id"]

    def __str__(self) -> str:
        return f"{self.item} x{self.requested_qty}"

    def _cumulative(self, field: str) -> int:
        if self.pk is None:
            return 0
        return self.movements.aggregate(total=Sum(field))["total"] or 0

    @property
    def issued_qty(self) -> int:
        return self._cumulative("quantity_issued")

    @property
    def received_qty(self) -> int:
        return self._cumulative("quantity_received")

    @property
    def balance_qty(self) -> int:
        return max(self.requested_qty - self.received_qty, 0)

    @property
    def status(self) -> str:
        if self.received_qty >= self.requested_qty and self.requested_qty > 0:
            return self.Status.RECEIVED
        if self.received_qty > 0:
            return self.Status.PART_RECEIVED
        if self.issued_qty >= self.requested_qty and self.requested_qty > 0:
            return self.Status.ISSUED
        if self.issued_qty > 0:
            return self.Status.PART_ISSUED
        return self.Status.REQUESTED


class PackingMaterialMovement(BaseModel):
    """One warehouse hand-off against a `PackingMaterialRequestLine` — the
    append-only ledger `issued_qty`/`received_qty` above are summed from.
    A single movement usually carries both an issued and a received
    quantity (warehouse hands it over, packing area receives it in the
    same motion), but they're independent fields since receipt can lag
    issue.
    """

    request_line = models.ForeignKey(
        PackingMaterialRequestLine, on_delete=models.CASCADE, related_name="movements"
    )
    date = models.DateField()
    quantity_issued = models.PositiveIntegerField(default=0)
    quantity_received = models.PositiveIntegerField(default=0)
    remarks = models.TextField(blank=True)
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="packing_material_movements"
    )

    class Meta:
        ordering = ["-date", "-id"]

    def __str__(self) -> str:
        return f"{self.request_line.item} — issued {self.quantity_issued} / received {self.quantity_received}"


class PackingExecutionConfig(BaseModel):
    """Singleton-per-organization recording configuration — spec v2 §2.5.
    Governs how the shift-floor execution screens behave (interval length,
    late-entry/grace rules, how "planned output" is calculated). Read via
    `apps.packing.services.get_execution_config`, which gets-or-creates the
    one row with these defaults rather than requiring seed data.
    """

    class RecordingMode(models.TextChoices):
        INTERVAL_BASED = "INTERVAL_BASED", "Interval Based"
        SHIFT_TOTAL = "SHIFT_TOTAL", "Shift Total"
        MANUAL_EVENT = "MANUAL_EVENT", "Manual Event Based"
        MACHINE_GENERATED = "MACHINE_GENERATED", "Machine Generated"

    class PlanCalculation(models.TextChoices):
        STANDARD_RATE = "STANDARD_RATE", "Standard Rate × Available Minutes"
        MANUAL = "MANUAL", "Manual"

    organization = models.OneToOneField(
        "core.Organization", on_delete=models.PROTECT, related_name="packing_execution_config"
    )
    recording_mode = models.CharField(
        max_length=20, choices=RecordingMode.choices, default=RecordingMode.INTERVAL_BASED
    )
    default_interval_minutes = models.PositiveIntegerField(default=60)
    auto_create_expected_intervals = models.BooleanField(default=True)
    allow_late_entry = models.BooleanField(default=True)
    missing_record_warning_minutes = models.PositiveIntegerField(default=15)
    plan_calculation = models.CharField(
        max_length=20, choices=PlanCalculation.choices, default=PlanCalculation.STANDARD_RATE
    )
    allow_partial_interval_on_sku_change = models.BooleanField(default=True)

    def __str__(self) -> str:
        return f"Packing execution config — {self.organization}"


class PackingShift(BaseModel):
    """One Date + Shift's floor session — the top of the v2 execution
    hierarchy (spec v2 §1.1/§1.4). Created and started together by the
    Packing Head's "Start Shift" action (`apps.packing.services
    .start_packing_shift`); every `PackingWorkCentreSession` for that
    date/shift hangs off this row.
    """

    class Status(models.TextChoices):
        NOT_STARTED = "NOT_STARTED", "Not Started"
        RUNNING = "RUNNING", "Running"
        STOPPED = "STOPPED", "Stopped"

    date = models.DateField()
    shift = models.ForeignKey(Shift, on_delete=models.PROTECT, related_name="packing_shifts")
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.NOT_STARTED)
    started_at = models.DateTimeField(null=True, blank=True)
    started_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, related_name="+", on_delete=models.SET_NULL
    )
    stopped_at = models.DateTimeField(null=True, blank=True)
    stopped_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, related_name="+", on_delete=models.SET_NULL
    )
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="packing_shifts"
    )

    class Meta:
        ordering = ["-date"]
        constraints = [
            models.UniqueConstraint(fields=["date", "shift"], name="unique_packing_shift_per_date_shift")
        ]

    def __str__(self) -> str:
        return f"{self.date} — {self.shift.name}"


class PackingWorkCentreSession(BaseModel):
    """A Work Centre's running state for one `PackingShift` — the v2
    execution anchor (spec v2 §1.3): "the Work Centre Session represents
    the physical Work Centre being active during the shift." SKU work
    (`PackingWorkCentreAllocation`) queues and changes underneath this
    without stopping it. `bay` is a snapshot of the Work Centre's Bay at
    session-start time so a later WC→Bay re-assignment in master data
    never reinterprets a historical shift's grouping.
    """

    class Status(models.TextChoices):
        RUNNING = "RUNNING", "Running"
        IDLE = "IDLE", "Idle"
        ISSUE = "ISSUE", "Issue"
        STOPPED = "STOPPED", "Stopped"

    packing_shift = models.ForeignKey(
        PackingShift, on_delete=models.CASCADE, related_name="work_centre_sessions"
    )
    work_centre = models.ForeignKey(
        "work_centres.WorkCentre", on_delete=models.PROTECT, related_name="packing_sessions"
    )
    bay = models.ForeignKey(
        "work_centres.Bay", on_delete=models.PROTECT, related_name="+"
    )
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.IDLE)
    started_at = models.DateTimeField(null=True, blank=True)
    stopped_at = models.DateTimeField(null=True, blank=True)
    stop_reason = models.CharField(max_length=30, blank=True)
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="packing_work_centre_sessions"
    )

    class Meta:
        ordering = ["work_centre__name"]
        constraints = [
            models.UniqueConstraint(
                fields=["packing_shift", "work_centre"], name="unique_session_per_shift_work_centre"
            )
        ]

    def __str__(self) -> str:
        return f"{self.work_centre.code} — {self.packing_shift}"

    @property
    def current_allocation(self) -> "PackingWorkCentreAllocation | None":
        return self.allocations.filter(status=PackingWorkCentreAllocation.Status.RUNNING).first()

    @property
    def packed_qty(self) -> int:
        from apps.processes.models import ProcessExecutionOutput

        return (
            ProcessExecutionOutput.objects.filter(
                execution__packing_interval_record__allocation__session=self,
                output_definition__classification__name="Good",
            ).aggregate(total=Sum("quantity"))["total"]
            or 0
        )


class PackingWorkCentreSessionOperator(BaseModel):
    """One operator on a `PackingWorkCentreSession` — snapshotted for the
    whole shift at Start Shift time (spec v2: "Operators assigned to Work
    Centre daily/shift-wise before shift start"), not per SKU allocation.
    Kept as a plain 1..N table even though the business rule expects
    exactly two, matching the same reasoning as the v1
    `PackingAllocationOperator` it replaces.
    """

    session = models.ForeignKey(
        PackingWorkCentreSession, on_delete=models.CASCADE, related_name="operators"
    )
    employee = models.ForeignKey("accounts.Employee", on_delete=models.PROTECT, related_name="+")
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="packing_session_operators"
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["session", "employee"], name="unique_operator_per_session")
        ]

    def __str__(self) -> str:
        return f"{self.session} — {self.employee.full_name}"


class PackingWorkCentreAllocation(BaseModel):
    """One SKU's queued/current slice of work inside a
    `PackingWorkCentreSession` — the v2 refactor moves this off Work
    Centre + Date + Shift directly (those now live on the session) and
    onto the session itself, in `sequence` order. A session can hold
    several allocations across different jobs during the same shift
    (processing SKUs sequentially), but only one may be RUNNING at a
    time — enforced in the serializer, not here. Completing/changing the
    current allocation does NOT stop the session (spec v2 §1.3/§2.7).
    """

    class Status(models.TextChoices):
        PLANNED = "PLANNED", "Planned"
        READY = "READY", "Ready"
        RUNNING = "RUNNING", "Running"
        COMPLETED = "COMPLETED", "Completed"
        ON_HOLD = "ON_HOLD", "On Hold"
        CANCELLED = "CANCELLED", "Cancelled"

    session = models.ForeignKey(
        PackingWorkCentreSession, on_delete=models.CASCADE, related_name="allocations"
    )
    job = models.ForeignKey(PackingJob, on_delete=models.CASCADE, related_name="allocations")
    process_version = models.ForeignKey(
        "processes.ProcessDefinitionVersion",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="+",
    )
    sequence = models.PositiveIntegerField()
    assigned_qty = models.PositiveIntegerField()
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PLANNED)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="packing_allocations"
    )

    class Meta:
        ordering = ["session__work_centre__name", "sequence"]
        constraints = [
            models.UniqueConstraint(
                fields=["session", "sequence"], name="unique_allocation_sequence_per_session"
            )
        ]

    def __str__(self) -> str:
        return f"{self.job.job_number} — {self.session.work_centre.code} #{self.sequence}"

    @property
    def packed_qty(self) -> int:
        from apps.processes.models import ProcessExecutionOutput

        return (
            ProcessExecutionOutput.objects.filter(
                execution__packing_interval_record__allocation=self,
                output_definition__classification__name="Good",
            ).aggregate(total=Sum("quantity"))["total"]
            or 0
        )

    @property
    def processed_qty(self) -> int:
        """Total output recorded for this allocation across every
        classification — see `PackingJob.processed_qty` for why completion
        is based on total throughput rather than Good-only output.
        """
        from apps.processes.models import ProcessExecutionOutput

        return (
            ProcessExecutionOutput.objects.filter(
                execution__packing_interval_record__allocation=self,
            ).aggregate(total=Sum("quantity"))["total"]
            or 0
        )

    @property
    def balance_qty(self) -> int:
        return max(self.assigned_qty - self.processed_qty, 0)


class WorkCentreIssueEvent(BaseModel):
    """A reported problem at a Work Centre Session — spec v2 §2.8.
    `started_at`/`resolved_at` are the source of truth for downtime;
    `apps.packing.services.downtime_minutes_for_interval` derives minutes
    from the overlap between this window and an interval's from/to rather
    than having anyone re-type a duration by hand.
    """

    class IssueType(models.TextChoices):
        MACHINE = "MACHINE", "Machine"
        MATERIAL = "MATERIAL", "Material"
        QUALITY = "QUALITY", "Quality"
        OTHER = "OTHER", "Other"

    session = models.ForeignKey(
        PackingWorkCentreSession, on_delete=models.CASCADE, related_name="issue_events"
    )
    allocation = models.ForeignKey(
        PackingWorkCentreAllocation, null=True, blank=True, on_delete=models.SET_NULL, related_name="issue_events"
    )
    issue_type = models.CharField(max_length=10, choices=IssueType.choices)
    description = models.TextField(blank=True)
    stops_productive_time = models.BooleanField(default=True)
    started_at = models.DateTimeField()
    resolved_at = models.DateTimeField(null=True, blank=True)
    reported_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, related_name="+", on_delete=models.SET_NULL
    )
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, related_name="+", on_delete=models.SET_NULL
    )
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="packing_issue_events"
    )

    class Meta:
        ordering = ["-started_at"]

    def __str__(self) -> str:
        return f"{self.get_issue_type_display()} — {self.session}"

    @property
    def is_open(self) -> bool:
        return self.resolved_at is None


class PackingIntervalRecord(BaseModel):
    """One hourly (or configured-interval) capture of Sorting + Cleaning +
    Packing at a Work Centre — spec v2 §2.4/§3.1, the module's new
    execution-of-record. `execution` links to exactly one generic
    `ProcessExecution` created/reconciled when this record is saved (one
    interval = one execution, per the confirmed mapping) — the interval
    record itself is the supervisor-facing shape; `ProcessExecution`
    remains the actual transaction backbone (spec v2 §1.4/§8).
    """

    class Status(models.TextChoices):
        EXPECTED = "EXPECTED", "Expected"
        ENTERED = "ENTERED", "Entered"
        MISSING = "MISSING", "Missing"
        LATE_ENTRY = "LATE_ENTRY", "Late Entry"
        CORRECTED = "CORRECTED", "Corrected"

    allocation = models.ForeignKey(
        PackingWorkCentreAllocation, on_delete=models.CASCADE, related_name="interval_records"
    )
    from_time = models.DateTimeField()
    to_time = models.DateTimeField()
    scheduled_minutes = models.PositiveIntegerField()
    downtime_minutes = models.PositiveIntegerField(default=0)
    available_minutes = models.PositiveIntegerField()
    standard_rate_snapshot = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    planned_output = models.PositiveIntegerField(default=0)
    premium_qty = models.PositiveIntegerField(default=0)
    standard_qty = models.PositiveIntegerField(default=0)
    reject_qty = models.PositiveIntegerField(default=0)
    cleaned_qty = models.PositiveIntegerField(default=0)
    pouches_packed = models.PositiveIntegerField(default=0)
    loose_pieces_packed = models.PositiveIntegerField(default=0)
    pieces_packed = models.PositiveIntegerField(default=0)
    cartons_completed = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.EXPECTED)
    entered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, related_name="+", on_delete=models.SET_NULL
    )
    entered_at = models.DateTimeField(null=True, blank=True)
    is_late_entry = models.BooleanField(default=False)
    remarks = models.TextField(blank=True)
    execution = models.OneToOneField(
        "processes.ProcessExecution",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="packing_interval_record",
    )
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="packing_interval_records"
    )

    class Meta:
        ordering = ["from_time"]

    def __str__(self) -> str:
        return f"{self.allocation} — {self.from_time:%H:%M}-{self.to_time:%H:%M}"

    @property
    def quality_total(self) -> int:
        return self.premium_qty + self.standard_qty + self.reject_qty

    @property
    def yield_percent(self) -> float | None:
        total = self.quality_total
        return round(self.premium_qty / total * 100, 1) if total else None

    @property
    def reject_percent(self) -> float | None:
        total = self.quality_total
        return round(self.reject_qty / total * 100, 1) if total else None

    @property
    def actual_rate(self) -> float | None:
        """Total quantity processed (sorted) per hour — comparable to
        `standard_rate_snapshot`, which rates the same combined Sorting +
        Cleaning + Packing process. Distinct from `packing_rate`, which
        rates finished-pieces-packed specifically.
        """
        if not self.available_minutes:
            return None
        return round(self.quality_total / (self.available_minutes / 60), 1)

    @property
    def packing_rate(self) -> float | None:
        if not self.available_minutes:
            return None
        return round(self.pieces_packed / (self.available_minutes / 60), 1)

    @property
    def efficiency_percent(self) -> float | None:
        rate = self.actual_rate
        if rate is None or not self.standard_rate_snapshot:
            return None
        return round(float(rate) / float(self.standard_rate_snapshot) * 100, 1)
