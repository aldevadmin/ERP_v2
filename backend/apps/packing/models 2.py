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
    unique per line.
    """

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        PLANNED = "PLANNED", "Planned"
        RELEASED = "RELEASED", "Released"
        CANCELLED = "CANCELLED", "Cancelled"

    export_order_line = models.ForeignKey(
        "export_orders.ExportOrderLine", on_delete=models.CASCADE, related_name="packing_plan_lines"
    )
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
        return f"{self.export_order_line} — {self.date} {self.shift.code} {self.bay.code}"

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
    job's material/output calculations.
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
        """Good-classified output from every completed/running execution
        wrapped by this job's work sessions — see
        `ProcessExecutionOutput`/`OutputClassification` in `apps.processes`.
        Never stored: always a live aggregate over the execution ledger,
        same "derive, don't duplicate" rule as `ExportOrderLine.packed_pieces`.
        """
        from apps.processes.models import ProcessExecutionOutput

        return (
            ProcessExecutionOutput.objects.filter(
                execution__packing_work_session__allocation__job=self,
                output_definition__classification__name="Good",
            ).aggregate(total=Sum("quantity"))["total"]
            or 0
        )

    @property
    def standard_qty(self) -> int:
        from apps.processes.models import ProcessExecutionOutput

        return (
            ProcessExecutionOutput.objects.filter(
                execution__packing_work_session__allocation__job=self,
                output_definition__classification__name="Standard",
            ).aggregate(total=Sum("quantity"))["total"]
            or 0
        )

    @property
    def reject_qty(self) -> int:
        from apps.processes.models import ProcessExecutionOutput

        return (
            ProcessExecutionOutput.objects.filter(
                execution__packing_work_session__allocation__job=self,
                output_definition__classification__name__in=["Reject", "Scrap"],
            ).aggregate(total=Sum("quantity"))["total"]
            or 0
        )

    @property
    def balance_qty(self) -> int:
        return max(self.target_qty - self.packed_qty, 0)

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


class PackingWorkCentreAllocation(BaseModel):
    """One Work Centre's assigned slice of a `PackingJob`, for a given
    date/shift, in `sequence` order. A Work Centre can hold several
    allocations across different jobs in the same shift (processing SKUs
    sequentially), but only one may be RUNNING at a time — enforced in the
    serializer, not here.
    """

    class Status(models.TextChoices):
        PLANNED = "PLANNED", "Planned"
        READY = "READY", "Ready"
        RUNNING = "RUNNING", "Running"
        COMPLETED = "COMPLETED", "Completed"
        ON_HOLD = "ON_HOLD", "On Hold"
        CANCELLED = "CANCELLED", "Cancelled"

    job = models.ForeignKey(PackingJob, on_delete=models.CASCADE, related_name="allocations")
    work_centre = models.ForeignKey(
        "work_centres.WorkCentre", on_delete=models.PROTECT, related_name="packing_allocations"
    )
    date = models.DateField()
    shift = models.ForeignKey(
        Shift, on_delete=models.PROTECT, related_name="packing_allocations"
    )
    sequence = models.PositiveIntegerField()
    assigned_qty = models.PositiveIntegerField()
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PLANNED)
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="packing_allocations"
    )

    class Meta:
        ordering = ["work_centre__name", "sequence"]
        constraints = [
            models.UniqueConstraint(
                fields=["work_centre", "date", "shift", "sequence"],
                name="unique_allocation_sequence_per_work_centre_shift",
            )
        ]

    def __str__(self) -> str:
        return f"{self.job.job_number} — {self.work_centre.code} #{self.sequence}"

    @property
    def packed_qty(self) -> int:
        from apps.processes.models import ProcessExecutionOutput

        return (
            ProcessExecutionOutput.objects.filter(
                execution__packing_work_session__allocation=self,
                output_definition__classification__name="Good",
            ).aggregate(total=Sum("quantity"))["total"]
            or 0
        )

    @property
    def balance_qty(self) -> int:
        return max(self.assigned_qty - self.packed_qty, 0)


class PackingAllocationOperator(BaseModel):
    """One operator on a `PackingWorkCentreAllocation` — kept as a plain
    1..N table (not a fixed pair of FKs) even though the business rule
    today expects exactly two, per spec §1.5: "keep model 1..N."
    Individual operator ids are retained for future analytics, but V1
    reports team/session performance only, never per-operator output.
    """

    allocation = models.ForeignKey(
        PackingWorkCentreAllocation, on_delete=models.CASCADE, related_name="operators"
    )
    employee = models.ForeignKey("accounts.Employee", on_delete=models.PROTECT, related_name="+")
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="packing_allocation_operators"
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["allocation", "employee"], name="unique_operator_per_allocation"
            )
        ]

    def __str__(self) -> str:
        return f"{self.allocation} — {self.employee.full_name}"


class PackingWorkSession(BaseModel):
    """A user-friendly wrapper around exactly one `ProcessExecution` — per
    spec §1.4/§8, the actual transaction backbone is the generic
    `ProcessExecution` engine; this model exists only to give the floor a
    single simple "start this allocation's work" / "complete this session"
    orchestration point. Today's configured Packing process
    (`Sorting_Cleaning_Packing`) is a single combined `ProcessDefinition`,
    so one session wraps one execution; if a future org splits Sorting/
    Cleaning/Packing into separate chained processes instead, this
    would need to become a one-to-many wrapper — deliberately not built
    that way yet, since no current configuration needs it (see the Phase 8
    assumption note in the implementation report).
    """

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        RUNNING = "RUNNING", "Running"
        COMPLETED = "COMPLETED", "Completed"

    allocation = models.ForeignKey(
        PackingWorkCentreAllocation, on_delete=models.CASCADE, related_name="sessions"
    )
    execution = models.OneToOneField(
        "processes.ProcessExecution",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="packing_work_session",
    )
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    remarks = models.TextField(blank=True)
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="packing_work_sessions"
    )

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"Session for {self.allocation}"
