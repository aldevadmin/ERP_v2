from django.db import models
from django.db.models import Sum

from apps.core.models import BaseModel


class ProcessCategory(BaseModel):
    """A configurable lookup for `ProcessDefinitionVersion.category` (e.g.
    Production, Quality, Packing, Movement). Kept as a bare name+active
    master record, same shape as `apps.vendors.Vendor` minus the code —
    there's no natural code concept for a category. Exists only to be
    selected from, never referenced by anything outside this app.
    """

    name = models.CharField(max_length=100, unique=True)
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="process_categories"
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "process categories"

    def __str__(self) -> str:
        return self.name


class ProcessDefinition(BaseModel):
    """A reusable activity's stable logical identity (e.g. "Pressing") —
    name and code never change across versions. Everything that's actually
    configured (category, resource, inputs, ...) lives on
    `ProcessDefinitionVersion`, so editing a process never reinterprets a
    version an execution has already pinned to.
    """

    name = models.CharField(max_length=255)
    code = models.CharField(max_length=32, unique=True)
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="process_definitions"
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name

    def current_version(self) -> "ProcessDefinitionVersion | None":
        """The version the UI/API should read and write — the `ACTIVE` one
        if there is one, otherwise the latest `DRAFT`/`ARCHIVED` row.
        """
        return (
            self.versions.filter(status=ProcessDefinitionVersion.Status.ACTIVE).first()
            or self.versions.first()
        )


class ProcessDefinitionVersion(BaseModel):
    """One versioned configuration snapshot of a `ProcessDefinition`. Only
    a `DRAFT` version may be edited — once `ACTIVE`, a version is
    immutable (enforced in `views.py`, not just by convention), since a
    future `ProcessExecution` will pin to a specific version and must never
    have its semantics silently reinterpreted. `ARCHIVED` marks a version
    superseded by a newer `ACTIVE` one. Only Basics (this model's own
    fields), Inputs (`ProcessInputDefinition`), Outputs
    (`ProcessOutputDefinition`), Work Centre, Output Capture, Parameters
    (`ProcessParameterDefinition` + this model's own Performance flags) and
    Rules (this model's own fields) are populated so far — Review is the
    remaining step.
    """

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        ACTIVE = "ACTIVE", "Active"
        ARCHIVED = "ARCHIVED", "Archived"

    class WorkCentreRequirement(models.TextChoices):
        MACHINE = "MACHINE", "Machine"
        STATION = "STATION", "Station"
        EITHER = "EITHER", "Machine or Station"
        NONE = "NONE", "No work centre required"

    class StandardRateConfigLevel(models.TextChoices):
        PROCESS = "PROCESS", "Process level"
        WORK_CENTRE = "WORK_CENTRE", "Work Centre level"
        TOOLING_POSITION = "TOOLING_POSITION", "Tooling / Position level"

    class CaptureMode(models.TextChoices):
        WORK_CENTRE_TOTAL = "WORK_CENTRE_TOTAL", "One total for the work centre"
        POSITION_LEVEL = "POSITION_LEVEL", "Separate output from parallel positions"
        BOTH = "BOTH", "Both"

    class BatchLotMode(models.TextChoices):
        DISABLED = "DISABLED", "Disabled"
        OPTIONAL = "OPTIONAL", "Optional"
        REQUIRED = "REQUIRED", "Required"

    class TransactionFrequency(models.TextChoices):
        SHIFT = "SHIFT", "Shift based"
        BATCH = "BATCH", "Batch based"
        MANUAL = "MANUAL", "Manual entry"
        MACHINE = "MACHINE", "Machine driven"

    class InputConsumptionMode(models.TextChoices):
        MANUAL = "MANUAL", "Manual capture"
        FORMULA = "FORMULA", "Formula driven"
        FUTURE_INVENTORY = "FUTURE_INVENTORY", "Future inventory integration"

    class CompletionMode(models.TextChoices):
        OPERATOR = "OPERATOR", "Operator marks transaction complete"
        TARGET_REACHED = "TARGET_REACHED", "Target quantity reached"

    class QcRequirement(models.TextChoices):
        NONE = "NONE", "None"
        REQUIRED = "REQUIRED", "QC required before output can move forward"

    process_definition = models.ForeignKey(
        ProcessDefinition, on_delete=models.CASCADE, related_name="versions"
    )
    version_number = models.PositiveIntegerField(editable=False)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    category = models.ForeignKey(
        ProcessCategory, on_delete=models.PROTECT, related_name="process_versions"
    )
    work_centre_requirement = models.CharField(
        max_length=10, choices=WorkCentreRequirement.choices, blank=True
    )  # Step 4 — which WorkCentre.type is eligible, if any
    operator_required = models.BooleanField(default=True)  # Step 4
    standard_rate_config_level = models.CharField(
        max_length=20, choices=StandardRateConfigLevel.choices, blank=True
    )  # Step 4 — where the standard output/hour rate is resolved from
    capture_mode = models.CharField(
        max_length=20, choices=CaptureMode.choices, blank=True
    )  # Step 5 — whole-work-centre total, per-position, or both
    position_label = models.CharField(max_length=100, blank=True)  # Step 5, e.g. "Mould Position"
    default_position_count = models.PositiveIntegerField(null=True, blank=True)  # Step 5
    allow_work_centre_override = models.BooleanField(default=True)  # Step 5
    allow_different_sku_per_position = models.BooleanField(default=True)  # Step 5
    allow_manual_standard_rate = models.BooleanField(default=True)  # Step 6 — PERFORMANCE
    reserve_machine_derived_rate = models.BooleanField(default=True)  # Step 6 — PERFORMANCE
    batch_lot_mode = models.CharField(
        max_length=10, choices=BatchLotMode.choices, default=BatchLotMode.OPTIONAL
    )
    transaction_frequency = models.CharField(
        max_length=10, choices=TransactionFrequency.choices, blank=True
    )  # Step 7 — RULES
    partial_output_forward = models.BooleanField(default=True)  # Step 7 — RULES
    # False by default (not True) so the tolerance-required rule below never
    # blocks a version save made before Rules has been configured.
    allow_over_production = models.BooleanField(default=False)  # Step 7 — RULES
    over_production_tolerance_percent = models.PositiveIntegerField(
        null=True, blank=True
    )  # Step 7 — RULES, required once allow_over_production is True
    input_consumption_mode = models.CharField(
        max_length=20, choices=InputConsumptionMode.choices, default=InputConsumptionMode.MANUAL
    )  # Step 7 — Advanced Rules
    completion_mode = models.CharField(
        max_length=15, choices=CompletionMode.choices, default=CompletionMode.OPERATOR
    )  # Step 7 — Advanced Rules
    qc_requirement = models.CharField(
        max_length=10, choices=QcRequirement.choices, default=QcRequirement.NONE
    )  # Step 7 — Advanced Rules
    allow_correction_with_audit_trail = models.BooleanField(default=True)  # Step 7 — Advanced Rules
    allow_destructive_delete = models.BooleanField(default=False)  # Step 7 — Advanced Rules
    permit_machine_generated_source = models.BooleanField(default=True)  # Step 7 — Advanced Rules
    description = models.TextField(blank=True)
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="process_versions"
    )

    class Meta:
        ordering = ["-version_number"]
        constraints = [
            models.UniqueConstraint(
                fields=["process_definition", "version_number"],
                name="unique_version_per_definition",
            )
        ]

    def __str__(self) -> str:
        return f"{self.process_definition.name} v{self.version_number} ({self.status})"


class ProcessInputDefinition(BaseModel):
    """One configured input row on a `ProcessDefinitionVersion` — Step 2 of
    the configuration wizard. `input_type` classifies which kind of item
    `item` must reference: WIP -> an `items.Item` with `item_class=WIP`;
    MATERIAL/PACKAGING/OTHER -> any non-WIP, non-FINISHED_GOOD item —
    enforced in the serializer. No quantity/formula execution logic lives
    here; this is configuration only.
    """

    class InputType(models.TextChoices):
        MATERIAL = "MATERIAL", "Material"
        WIP = "WIP", "WIP"
        PACKAGING = "PACKAGING", "Packaging"
        OTHER = "OTHER", "Other"

    class QuantityCapture(models.TextChoices):
        MANUAL = "MANUAL", "Manual"
        FORMULA = "FORMULA", "Formula"
        OPTIONAL = "OPTIONAL", "Optional"

    process_version = models.ForeignKey(
        ProcessDefinitionVersion, on_delete=models.CASCADE, related_name="inputs"
    )
    sequence = models.PositiveIntegerField()
    input_type = models.CharField(max_length=10, choices=InputType.choices)
    item = models.ForeignKey(
        "items.Item", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    uom = models.CharField(max_length=20)
    quantity_capture = models.CharField(
        max_length=10, choices=QuantityCapture.choices, default=QuantityCapture.MANUAL
    )
    is_required = models.BooleanField(default=True)
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="process_inputs"
    )

    class Meta:
        ordering = ["sequence"]
        constraints = [
            models.UniqueConstraint(
                fields=["process_version", "sequence"], name="unique_input_sequence_per_version"
            )
        ]

    def __str__(self) -> str:
        return f"{self.item} ({self.input_type})"


class OutputClassification(BaseModel):
    """A configurable lookup for `ProcessOutputDefinition.classification`
    (e.g. Premium, Standard, Good, Reject, Scrap). Kept as a real master —
    same shape as `ProcessCategory` — rather than a hard-coded enum,
    because these labels carry no fixed meaning the code should ever
    branch on; seeded with PREMIUM/STANDARD/GOOD/REJECT/SCRAP/OTHER by
    migration, extendable from Settings.
    """

    name = models.CharField(max_length=100, unique=True)
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="output_classifications"
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "output classifications"

    def __str__(self) -> str:
        return self.name


class ProcessOutputDefinition(BaseModel):
    """One configured output row on a `ProcessDefinitionVersion` — Step 3
    of the configuration wizard. `item_type` classifies which kind of item
    `item` must reference (PRODUCT -> `item_class` in {WIP, FINISHED_GOOD},
    MATERIAL -> any other class) — unlike Step 2's `InputType`, this isn't
    a user-facing business category (that's `classification` below); it
    exists only because the Output Item picker needs to know which bucket
    of the unified Item list a given id must belong to.
    `default_storage_destination` is free text, not a Location FK: no
    Location/Inventory master exists yet in this codebase, and the spec
    marks the field optional/convenience-only, so adding one now would be
    premature infrastructure.
    """

    class ItemType(models.TextChoices):
        MATERIAL = "MATERIAL", "Material"
        PRODUCT = "PRODUCT", "Product"

    process_version = models.ForeignKey(
        ProcessDefinitionVersion, on_delete=models.CASCADE, related_name="outputs"
    )
    sequence = models.PositiveIntegerField()
    item_type = models.CharField(max_length=10, choices=ItemType.choices)
    item = models.ForeignKey(
        "items.Item", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    uom = models.CharField(max_length=20)
    classification = models.ForeignKey(
        OutputClassification, on_delete=models.PROTECT, related_name="process_outputs"
    )
    can_move_forward = models.BooleanField(default=True)
    creates_traceable_output = models.BooleanField(default=True)
    default_storage_destination = models.CharField(max_length=100, blank=True)
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="process_outputs"
    )

    class Meta:
        ordering = ["sequence"]
        constraints = [
            models.UniqueConstraint(
                fields=["process_version", "sequence"], name="unique_output_sequence_per_version"
            )
        ]

    def __str__(self) -> str:
        return f"{self.item} ({self.classification})"


class ProcessParameterDefinition(BaseModel):
    """One dynamic, process-specific field on a `ProcessDefinitionVersion`
    — Step 6 of the configuration wizard. Exists so a process can capture
    arbitrary operational data (Temperature, Cycle Time, a Tooling
    reference, ...) without a schema migration per process; the eventual
    execution form renders these dynamically, ordered by `sequence`.
    `code` is derived from `label` client-side (same slugify-until-touched
    pattern as `ProcessDefinition.code`) and must stay stable once set —
    only uniqueness per version is enforced here, since different
    processes may reuse the same parameter code (e.g. "TEMPERATURE").
    `default_value` is deliberately a single free-text field, doubling as
    the default for scalar types and a raw options list for `SELECT` —
    matching the wireframe's one combined "Default Value / Allowed
    Options" input; parsing that for SELECT is an execution-time concern,
    not built yet.
    """

    class DataType(models.TextChoices):
        NUMBER = "NUMBER", "Number"
        TEXT = "TEXT", "Text"
        BOOLEAN = "BOOLEAN", "Boolean"
        SELECT = "SELECT", "Select"
        REFERENCE = "REFERENCE", "Reference"
        DATE = "DATE", "Date"
        DATETIME = "DATETIME", "Date & Time"

    class CaptureAt(models.TextChoices):
        SETUP = "SETUP", "Setup"
        START = "START", "Start"
        DURING = "DURING", "During"
        COMPLETION = "COMPLETION", "Completion"

    process_version = models.ForeignKey(
        ProcessDefinitionVersion, on_delete=models.CASCADE, related_name="parameters"
    )
    sequence = models.PositiveIntegerField()
    label = models.CharField(max_length=255)
    code = models.CharField(max_length=64)
    data_type = models.CharField(max_length=10, choices=DataType.choices)
    unit = models.CharField(max_length=20, blank=True)
    capture_at = models.CharField(max_length=10, choices=CaptureAt.choices)
    is_required = models.BooleanField(default=True)
    default_value = models.TextField(blank=True)
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="process_parameters"
    )

    class Meta:
        ordering = ["sequence"]
        constraints = [
            models.UniqueConstraint(
                fields=["process_version", "sequence"],
                name="unique_parameter_sequence_per_version",
            ),
            models.UniqueConstraint(
                fields=["process_version", "code"], name="unique_parameter_code_per_version"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.label} ({self.code})"


class ProcessExecution(BaseModel):
    """One actual recorded run of a `ProcessDefinitionVersion` — the
    generic execution engine that fills the gap `ProcessDefinitionVersion`
    itself only configures (see that model's docstring: "a future
    `ProcessExecution` will pin to a specific version"). This is that
    model. It's deliberately generic — the Packing module's Sorting,
    Cleaning, and Packing steps are the first real caller, but a future
    Production module records against the exact same tables, never a
    separate SortingTransaction/CleaningTransaction/PackingTransaction
    domain engine.

    Always pins to a specific `process_version` (never the live
    `ProcessDefinition`), same reasoning as `ProcessRouteNode` — a later
    re-version of the process must never reinterpret an already-recorded
    execution. `work_centre` is required only when
    `process_version.work_centre_requirement != NONE`, and
    `batch_lot_number` only when `process_version.batch_lot_mode ==
    REQUIRED` — both enforced in the serializer, not here, matching this
    codebase's convention of keeping conditional-required validation in
    the serializer layer.

    No delete — corrections happen via PATCH, the same no-destructive-edit
    rule already followed by `ProductionTransaction`/`PackingTransaction`
    elsewhere in this codebase (see `ProcessDefinitionVersion.
    allow_correction_with_audit_trail`, which this model doesn't yet
    enforce at the field level but is designed to support later).
    """

    process_version = models.ForeignKey(
        ProcessDefinitionVersion, on_delete=models.PROTECT, related_name="executions"
    )
    work_centre = models.ForeignKey(
        "work_centres.WorkCentre", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    export_order_line = models.ForeignKey(
        "export_orders.ExportOrderLine",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="process_executions",
    )
    date = models.DateField()
    batch_lot_number = models.CharField(max_length=64, blank=True)
    # Who worked this execution — decided fresh every time, never a fixed
    # roster (see the Packing module's Material Issue design, same
    # principle). Blank when `process_version.operator_required` is False.
    employees = models.ManyToManyField("accounts.Employee", blank=True, related_name="+")
    remarks = models.TextField(blank=True)
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="process_executions"
    )

    class Meta:
        ordering = ["-date", "-id"]

    def __str__(self) -> str:
        return f"{self.process_version.process_definition.name} — {self.date}"

    @property
    def total_input_quantity(self) -> int:
        return self.inputs.aggregate(total=Sum("quantity"))["total"] or 0

    @property
    def total_output_quantity(self) -> int:
        """The generic "how much did this execution process in total"
        figure — e.g. the Packing module's "Sorted" readout is exactly
        this, derived rather than separately entered so it can never
        disagree with the classification breakdown it's the sum of.
        """
        return self.outputs.aggregate(total=Sum("quantity"))["total"] or 0

    def output_quantity_for_classification(self, classification_name: str) -> int:
        return (
            self.outputs.filter(output_definition__classification__name=classification_name)
            .aggregate(total=Sum("quantity"))["total"]
            or 0
        )


class ProcessExecutionInput(BaseModel):
    """One input row actually consumed by a `ProcessExecution` — the
    execution-time counterpart to `ProcessInputDefinition`'s configuration.
    `quantity` is populated server-side (see
    `apps.packing.services.picked_up_quantity_for`), not typed in by the
    operator, whenever the calling module already has an authoritative
    source (e.g. Packing's Material Issue ledger) — this row still exists
    so the figure is snapshotted permanently against the execution, not
    left to drift if the upstream source changes later.
    """

    execution = models.ForeignKey(ProcessExecution, on_delete=models.CASCADE, related_name="inputs")
    input_definition = models.ForeignKey(
        ProcessInputDefinition, on_delete=models.PROTECT, related_name="execution_inputs"
    )
    quantity = models.PositiveIntegerField()
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="process_execution_inputs"
    )

    def __str__(self) -> str:
        return f"{self.execution} — {self.input_definition.item} x{self.quantity}"


class ProcessExecutionOutput(BaseModel):
    """One output row actually produced by a `ProcessExecution` — the
    execution-time counterpart to `ProcessOutputDefinition`'s
    configuration. `output_definition` carries the item/classification/uom
    semantics; this row never duplicates them, same reasoning as
    `ProcessRouteEdge.source_output_definition` upstream.
    """

    execution = models.ForeignKey(ProcessExecution, on_delete=models.CASCADE, related_name="outputs")
    output_definition = models.ForeignKey(
        ProcessOutputDefinition, on_delete=models.PROTECT, related_name="execution_outputs"
    )
    quantity = models.PositiveIntegerField()
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="process_execution_outputs"
    )

    def __str__(self) -> str:
        return f"{self.execution} — {self.output_definition.item} x{self.quantity}"
