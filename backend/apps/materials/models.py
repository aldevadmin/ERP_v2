from django.db import models

from apps.core.models import BaseModel


class Material(BaseModel):
    """A raw material / consumable master record — code/name/unit/active,
    same shape and scope as `apps.products.Product`. Distinct from Product:
    a Product is a sellable finished SKU, a Material is what a Process
    consumes or produces on the way there. Referenced by
    `apps.processes.Process.inputs`/`.outputs`.
    """

    code = models.CharField(max_length=32, unique=True)
    name = models.CharField(max_length=255)
    unit = models.CharField(max_length=20)
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="materials"
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return f"{self.name} ({self.code})"
