from django.contrib.postgres.fields import ArrayField
from django.db import models

from apps.core.models import BaseModel


class Customer(BaseModel):
    """A company this business sells to.

    Reusable master data — not scoped to Export Order Management. No CRM
    fields (leads/opportunities/pipeline) — this is just who the customer
    is and where to bill/ship, per docs/modules/export-orders/domain-model.md
    §2.3.

    No top-level `country`/`currency` — those were dropped as part of the
    "Customers - screen" spec revamp (not in the spec; `ExportOrder` already
    carries its own independent `country`/`currency` per order).
    """

    code = models.CharField(max_length=32, unique=True)
    name = models.CharField(max_length=255)
    main_poc = models.CharField(max_length=255, blank=True, default="")
    # List-of-strings, not a child table — each entry carries no other data
    # of its own (unlike CustomerAddress, which the spec gave its own modal).
    emails = ArrayField(models.EmailField(), default=list, blank=True)
    phone_numbers = ArrayField(models.CharField(max_length=32), default=list, blank=True)
    internal_coordinator = models.ForeignKey(
        "accounts.Employee",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="customers"
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return f"{self.name} ({self.code})"


class CustomerAddress(BaseModel):
    """No `city` — the "Customers - screen" spec's address fields are Type/
    Country/State/Address Line 1-3/PIN only.
    """

    class AddressType(models.TextChoices):
        BILLING = "BILLING", "Billing"
        SHIPPING = "SHIPPING", "Shipping"
        BILLING_AND_SHIPPING = "BILLING_AND_SHIPPING", "Billing & Shipping"

    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name="addresses")
    address_type = models.CharField(max_length=21, choices=AddressType.choices)
    country = models.CharField(max_length=100)
    state = models.CharField(max_length=100, blank=True)
    line1 = models.CharField(max_length=255)
    line2 = models.CharField(max_length=255, blank=True)
    line3 = models.CharField(max_length=255, blank=True)
    pin = models.CharField(max_length=20, blank=True)

    class Meta:
        ordering = ["address_type", "id"]
        verbose_name_plural = "Customer addresses"

    def __str__(self) -> str:
        return f"{self.get_address_type_display()} — {self.line1}"
