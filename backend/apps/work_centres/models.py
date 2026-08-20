from django.db import models

from apps.core.models import BaseModel


class WorkCentre(BaseModel):
    """A Machine or Station master record — the physical resource a
    Process's Step 4 (Work Centre) declares a requirement for. A process
    never references a specific `WorkCentre` directly (see
    `apps.processes.ProcessDefinitionVersion.work_centre_requirement`,
    which only stores MACHINE/STATION/EITHER/NONE); which work centres are
    actually eligible for a process is this model's own
    `WorkCentreProcessCapability` mapping, configured here.
    """

    class Type(models.TextChoices):
        MACHINE = "MACHINE", "Machine"
        STATION = "STATION", "Station"

    name = models.CharField(max_length=255)
    code = models.CharField(max_length=32, unique=True)
    type = models.CharField(max_length=10, choices=Type.choices)
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
        on_delete=models.CASCADE,
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
