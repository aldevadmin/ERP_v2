from django.db import models

from apps.core.models import BaseModel


class Material(BaseModel):
    """A raw material / consumable master record — code/name/unit/active,
    same shape and scope as `apps.products.Product`. Distinct from Product:
    a Product is a sellable finished SKU (or, when `stage=SEMI_FINISHED`, an
    internally-produced semi-finished item), a Material is something bought
    in, never itself a process output. Referenced by
    `apps.processes.ProcessInputDefinition.material`.
    """

    class Category(models.TextChoices):
        RAW_MATERIAL = "RAW_MATERIAL", "Raw Material"
        PACKAGING = "PACKAGING", "Packaging"

    code = models.CharField(max_length=32, unique=True)
    name = models.CharField(max_length=255)
    unit = models.CharField(max_length=20)
    category = models.CharField(
        max_length=20, choices=Category.choices, default=Category.RAW_MATERIAL, blank=True
    )
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="materials"
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return f"{self.name} ({self.code})"
