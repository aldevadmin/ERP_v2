from django.db import models

from apps.core.models import BaseModel


class WorkCentreType(BaseModel):
    """A configurable lookup for `WorkCentre.type` (e.g. Machine, Station).
    Kept as a real master — same shape as `apps.processes.ProcessCategory`
    — rather than a hard-coded enum, because nothing in this codebase
    branches on the specific value; seeded with Machine/Station by
    migration, extendable from Settings.
    """

    name = models.CharField(max_length=100, unique=True)
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="work_centre_types"
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "work centre types"

    def __str__(self) -> str:
        return self.name


class Bay(BaseModel):
    """A planning/location grouping of Work Centres (e.g. "Bay 1") — used
    by the Packing module's weekly planner to plan at Bay level without
    micromanaging individual Work Centres. Deliberately a bare lookup, not
    itself an execution resource: nothing is ever produced "at a Bay,"
    only at the `WorkCentre`s it groups (see `WorkCentre.bay` below). Lives
    here rather than in `apps.packing` so `WorkCentre` can reference it
    without that app depending back on packing.
    """

    name = models.CharField(max_length=100, unique=True)
    code = models.CharField(max_length=32, unique=True)
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="bays"
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return f"{self.name} ({self.code})"


class WorkCentre(BaseModel):
    """A Machine or Station master record — the physical resource a
    Process's Step 4 (Work Centre) declares a requirement for. A process
    never references a specific `WorkCentre` directly (see
    `apps.processes.ProcessDefinitionVersion.work_centre_requirement`,
    which only stores MACHINE/STATION/EITHER/NONE); which work centres are
    actually eligible for a process is this model's own
    `WorkCentreProcessCapability` mapping, configured here.
    """

    name = models.CharField(max_length=255)
    code = models.CharField(max_length=32, unique=True)
    type = models.ForeignKey(WorkCentreType, on_delete=models.PROTECT, related_name="work_centres")
    # Nullable — a Work Centre can exist and run processes (e.g. Machines
    # used outside the Packing floor) without ever belonging to a Packing
    # Bay. Only Station-type work centres used by Packing need one set.
    bay = models.ForeignKey(
        Bay, null=True, blank=True, on_delete=models.PROTECT, related_name="work_centres"
    )
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="work_centres"
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return f"{self.name} ({self.code})"


class WorkCentreProcessCapability(BaseModel):
    """Declares that a `WorkCentre` is capable of running a
    `ProcessDefinition`, optionally with a standard rate (units/hour) used
    when `ProcessDefinitionVersion.standard_rate_config_level ==
    WORK_CENTRE`. `standard_rate` is nullable — a capability can exist
    (the process is eligible to run here) before its rate is configured;
    resolving/consuming this rate is operator-execution scope, not built
    yet.
    """

    work_centre = models.ForeignKey(
        WorkCentre, on_delete=models.CASCADE, related_name="capabilities"
    )
    process_definition = models.ForeignKey(
        "processes.ProcessDefinition",
        on_delete=models.PROTECT,
        related_name="work_centre_capabilities",
    )
    standard_rate = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="work_centre_capabilities"
    )

    class Meta:
        ordering = ["process_definition__name"]
        constraints = [
            models.UniqueConstraint(
                fields=["work_centre", "process_definition"],
                name="unique_capability_per_work_centre_process",
            )
        ]

    def __str__(self) -> str:
        return f"{self.work_centre.name} -> {self.process_definition.name}"
