from django.db import models

from apps.core.models import BaseModel


class Vendor(BaseModel):
    """A minimal external-supplier master record — code/name/category/active,
    same shape and scope as `apps.accounts.Team`. Not a full vendor-management
    entity: no approval workflow, no rating, no commercial terms — those live
    on whatever references a vendor (e.g. `export_orders.ProcurementTransaction`),
    not here. Admin-managed only, same precedent as `Team`.
    """

    code = models.CharField(max_length=32, unique=True)
    name = models.CharField(max_length=255)
    category = models.CharField(max_length=100, blank=True)
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="vendors"
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name
