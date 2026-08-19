from django.db import models

from apps.core.models import BaseModel


class ProcessCategory(BaseModel):
    """A configurable lookup for `Process.category` (e.g. Production,
    Quality, Packing, Movement). Kept as a bare name+active master record,
    same shape as `apps.vendors.Vendor` minus the code — there's no natural
    code concept for a category. Exists only to be selected from, never
    referenced by anything outside this app.
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


class Process(BaseModel):
    """A reusable activity definition used across Production, Packing and
    Inventory (e.g. Washing, Pressing, Packing). `inputs`/`outputs` are a
    plain list of Materials this process consumes/produces — no quantity or
    ordering is captured in this pass, since none was asked for; if that
    need shows up later, it's a straightforward move to a through-model.
    """

    class ResourceType(models.TextChoices):
        STATION = "STATION", "Station"
        MACHINE = "MACHINE", "Machine"
        LOCATION = "LOCATION", "Location"

    name = models.CharField(max_length=255)
    category = models.ForeignKey(
        ProcessCategory, on_delete=models.PROTECT, related_name="processes"
    )
    resource_type = models.CharField(max_length=10, choices=ResourceType.choices)
    inputs = models.ManyToManyField(
        "materials.Material", related_name="input_of_processes", blank=True
    )
    outputs = models.ManyToManyField(
        "materials.Material", related_name="output_of_processes", blank=True
    )
    description = models.TextField(blank=True)
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="processes"
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name
