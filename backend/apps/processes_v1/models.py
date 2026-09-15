from django.db import models

from apps.core.models import BaseModel


class ProcessDefinitionV1(BaseModel):
    """A reusable activity's stable logical identity (e.g. "Pressing") —
    name and code never change across versions. Everything that's actually
    configured (category, inputs, outputs) lives on
    `ProcessDefinitionVersionV1`, mirroring the original `apps.processes`
    split exactly, so editing a process never reinterprets a version a
    Route has already pinned to.

    Deliberately lean compared to the original `processes.ProcessDefinition`
    /`ProcessDefinitionVersion`: this whole app exists to prove Input/Output
    slots can be generalized by `items.ItemGroup` instead of pinned to one
    exact `Item` — it carries none of the original's execution-orchestration
    fields (work centre requirement, capture mode, standard rate, batch/lot
    mode, transaction frequency, QC, ...), since there is no execution/
    recording consumer for this engine yet. Those can be added if and when
    a real domain module (Production, Sorting, a rebuilt Packing) needs
    them — adding them now would be speculative.
    """

    name = models.CharField(max_length=255)
    code = models.CharField(max_length=32, unique=True)
    is_active = models.BooleanField(default=True)
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="process_definitions_v1"
    )

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name

    def current_version(self) -> "ProcessDefinitionVersionV1 | None":
        """The version the UI/API should read and write — the `ACTIVE` one
        if there is one, otherwise the latest `DRAFT`/`ARCHIVED` row.
        """
        return (
            self.versions.filter(status=ProcessDefinitionVersionV1.Status.ACTIVE).first()
            or self.versions.first()
        )


class ProcessDefinitionVersionV1(BaseModel):
    """One versioned configuration snapshot of a `ProcessDefinitionV1`.
    Only a `DRAFT` version may be edited — once `ACTIVE`, a version is
    immutable (enforced in `views.py`), since a
    `product_routes_v1.ProcessRouteNodeV1` pins to a specific version at
    activation and must never have its inputs/outputs silently
    reinterpreted afterward.
    """

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        ACTIVE = "ACTIVE", "Active"
        ARCHIVED = "ARCHIVED", "Archived"

    process_definition = models.ForeignKey(
        ProcessDefinitionV1, on_delete=models.CASCADE, related_name="versions"
    )
    version_number = models.PositiveIntegerField(editable=False)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    # Reuses the existing, shared `processes.ProcessCategory` lookup — it
    # stays exactly as loose/free-text as it already is; no reason to
    # duplicate it for this engine.
    category = models.ForeignKey(
        "processes.ProcessCategory", on_delete=models.PROTECT, related_name="+"
    )
    description = models.TextField(blank=True)
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="process_definition_versions_v1"
    )

    class Meta:
        ordering = ["-version_number"]
        constraints = [
            models.UniqueConstraint(
                fields=["process_definition", "version_number"],
                name="unique_version_per_definition_v1",
            )
        ]

    def __str__(self) -> str:
        return f"{self.process_definition.name} v{self.version_number} ({self.status})"


class ProcessInputDefinitionV1(BaseModel):
    """One configured input slot on a `ProcessDefinitionVersionV1`.

    Unlike the original `processes.ProcessInputDefinition` (pinned to one
    exact `items.Item`), this matches on `item_group` — a whole family of
    interchangeable items at one stage/role (see `items.ItemGroup`'s
    docstring for why that's the right key, not item_class/Product Type/
    Material Type). Which *concrete* item actually applies for a given
    finished SKU is resolved elsewhere, per SKU, by
    `product_routes_v1.ProcessRouteItemMappingV1` — this row only declares
    "what family of thing goes here," not which item.
    """

    process_version = models.ForeignKey(
        ProcessDefinitionVersionV1, on_delete=models.CASCADE, related_name="inputs"
    )
    sequence = models.PositiveIntegerField()
    item_group = models.ForeignKey(
        "items.ItemGroup", on_delete=models.PROTECT, related_name="+"
    )
    uom = models.CharField(max_length=20)
    is_required = models.BooleanField(default=True)
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="process_inputs_v1"
    )

    class Meta:
        ordering = ["sequence"]
        constraints = [
            models.UniqueConstraint(
                fields=["process_version", "sequence"], name="unique_input_sequence_per_version_v1"
            )
        ]

    def __str__(self) -> str:
        return f"{self.item_group} ({self.uom})"


class ProcessOutputDefinitionV1(BaseModel):
    """One configured output slot on a `ProcessDefinitionVersionV1` — same
    `item_group`-keyed matching as `ProcessInputDefinitionV1`. `classification`
    (reusing the existing, shared `processes.OutputClassification` lookup)
    is kept alongside `item_group`, not replaced by it: `item_group` is the
    precise match key per family/stage/grade as an admin defines it (e.g. a
    branching node's Good/Standard/Reject outputs are three separate rows,
    each with its own distinct `item_group`); `classification` stays as the
    standardized cross-cutting vocabulary so aggregate reporting ("total
    Reject output today across every process") doesn't have to infer
    meaning from group names — mirrors how `apps.packing_lite` already uses
    `OutputClassification` for exactly that today.
    """

    process_version = models.ForeignKey(
        ProcessDefinitionVersionV1, on_delete=models.CASCADE, related_name="outputs"
    )
    sequence = models.PositiveIntegerField()
    item_group = models.ForeignKey(
        "items.ItemGroup", on_delete=models.PROTECT, related_name="+"
    )
    classification = models.ForeignKey(
        "processes.OutputClassification",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
    )
    uom = models.CharField(max_length=20)
    can_move_forward = models.BooleanField(default=True)
    creates_traceable_output = models.BooleanField(default=True)
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="process_outputs_v1"
    )

    class Meta:
        ordering = ["sequence"]
        constraints = [
            models.UniqueConstraint(
                fields=["process_version", "sequence"], name="unique_output_sequence_per_version_v1"
            )
        ]

    def __str__(self) -> str:
        return str(self.item_group)
