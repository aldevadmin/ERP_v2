from django.db import models

from apps.core.models import BaseModel


class ToolingType(BaseModel):
    """A configurable lookup for `Tooling.tooling_type` (e.g. Mould, Die,
    Jig, Fixture, Cutting Tool, Forming Tool, Other). Kept as a real master
    — same shape as `apps.processes.ProcessCategory` — rather than a
    hard-coded enum, because nothing in this codebase branches on the
    specific value; seeded with the original 7 by migration, extendable
    from Settings.
    """

    name = models.CharField(max_length=100, unique=True)
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="tooling_types"
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "tooling types"

    def __str__(self) -> str:
        return self.name


class Tooling(BaseModel):
    """A reusable physical tool master — Mould, Die, Jig, Fixture, Cutting
    Tool, Forming Tool, Other. Never permanently bound to a Work Centre
    position; which position (if any) currently has it installed is tracked
    by time-aware `ToolingAssignment` rows instead. If the same physical
    tool exists in multiple duplicate instances, each instance gets its own
    `Tooling` row/code — this model represents one physical tool, not a
    type/class of tool.
    """

    code = models.CharField(max_length=32, unique=True)
    name = models.CharField(max_length=255)
    tooling_type = models.ForeignKey(ToolingType, on_delete=models.PROTECT, related_name="tooling")
    cavity_count = models.PositiveIntegerField(null=True, blank=True)
    default_standard_rate = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True
    )
    is_active = models.BooleanField(default=True)
    notes = models.TextField(blank=True)
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="tooling"
    )

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "tooling"

    def __str__(self) -> str:
        return f"{self.name} ({self.code})"


class ToolingCompatibility(BaseModel):
    """Declares that `tooling` is usable for `item` — advisory for the
    frontend's filtering, but the backend treats it as authoritative:
    assigning incompatible tooling to a position is rejected. Optionally
    narrowed to a specific `process_definition` (e.g. this mould is only
    compatible with this item when run through this specific process).
    """

    tooling = models.ForeignKey(Tooling, on_delete=models.CASCADE, related_name="compatibilities")
    item = models.ForeignKey("items.Item", on_delete=models.PROTECT, related_name="+")
    process_definition = models.ForeignKey(
        "processes.ProcessDefinition",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
    )
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="tooling_compatibilities"
    )

    class Meta:
        ordering = ["tooling__name"]
        constraints = [
            models.UniqueConstraint(
                fields=["tooling", "item", "process_definition"],
                name="unique_compatibility_per_tooling_item_process",
            )
        ]

    def __str__(self) -> str:
        return f"{self.tooling} -> {self.item}"


class WorkCentrePosition(BaseModel):
    """One physical, addressable position on a `WorkCentre` (e.g. "Mould
    Position 3" on Press Machine 01) — exists independently of any specific
    Process, since a machine's physical positions don't change based on
    what process happens to run there this shift. `display_label` overrides
    the generic "Position N" label; when blank, the frontend falls back to
    the running Process's own `position_label` (Step 5) + index.
    """

    work_centre = models.ForeignKey(
        "work_centres.WorkCentre", on_delete=models.CASCADE, related_name="positions"
    )
    position_index = models.PositiveIntegerField()
    display_label = models.CharField(max_length=255, blank=True)
    is_active = models.BooleanField(default=True)
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="work_centre_positions"
    )

    class Meta:
        ordering = ["position_index"]
        constraints = [
            models.UniqueConstraint(
                fields=["work_centre", "position_index"], name="unique_position_per_work_centre"
            )
        ]

    def __str__(self) -> str:
        return self.display_label or f"{self.work_centre.name} — Position {self.position_index}"


class ToolingAssignment(BaseModel):
    """Time-aware record of `tooling` being installed at
    `work_centre_position`. `effective_to` null means currently active.
    Assignment history is append-only from the user's perspective — a
    changeover closes the previous assignment (sets its `effective_to`)
    and creates a new row, rather than editing history in place. Overlap
    (same tooling in two places, or two tools on one position, at the same
    time) is rejected in the view/service layer, not a DB constraint —
    consistent with how this codebase validates every other whole-row
    business rule.
    """

    tooling = models.ForeignKey(Tooling, on_delete=models.PROTECT, related_name="assignments")
    work_centre_position = models.ForeignKey(
        WorkCentrePosition, on_delete=models.PROTECT, related_name="assignments"
    )
    default_item = models.ForeignKey(
        "items.Item", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    standard_rate_override = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True
    )
    effective_from = models.DateTimeField()
    effective_to = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True)
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="tooling_assignments"
    )

    class Meta:
        ordering = ["-effective_from"]

    def __str__(self) -> str:
        return f"{self.tooling} @ {self.work_centre_position} from {self.effective_from}"
