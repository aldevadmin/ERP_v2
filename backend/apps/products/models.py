from typing import Any

from django.core.exceptions import ValidationError
from django.db import models

from apps.core.models import BaseModel

MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024  # 5MB
ALLOWED_UPLOAD_CONTENT_TYPES = {
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "application/pdf",
}


def validate_upload_file_size(file: Any) -> None:
    if file.size > MAX_UPLOAD_SIZE_BYTES:
        raise ValidationError("File must be 5MB or smaller.")


def validate_upload_file_type(file: Any) -> None:
    content_type = getattr(file, "content_type", None)
    if content_type not in ALLOWED_UPLOAD_CONTENT_TYPES:
        raise ValidationError("Only image files (JPEG, PNG, GIF, WebP) or PDF are allowed.")


class Product(BaseModel):
    """A SKU. Reusable master data — not scoped to Export Order Management.

    Deliberately excludes quantity fields like stock-on-hand, allocated,
    produced, received, ... — those belong to Inventory/Production/
    Procurement, which reference this record; they don't live on it.

    `available_qty` is the one deliberate exception: a manually-adjusted
    "available finished stock" placeholder, touched only by the Export
    Order Loading workflow's stock-return reconciliation
    (`export_orders.ExportOrderLine.sync_stock_return()`) — not a
    general-purpose stock field yet, and not written to by anything else
    (packing, production, procurement). A real Inventory module will
    eventually own this properly.

    `stage` distinguishes a customer-facing finished SKU from an internal
    semi-finished item that only flows between Processes (e.g. an untrimmed
    plate before it becomes the finished, sellable plate) — reused instead
    of a separate WIP master; see `apps.processes.ProcessInputDefinition`.
    """

    class Stage(models.TextChoices):
        SEMI_FINISHED = "SEMI_FINISHED", "Semi-Finished"
        FINISHED_GOOD = "FINISHED_GOOD", "Finished Good"

    sku_code = models.CharField(max_length=32, unique=True)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    base_unit = models.CharField(max_length=20)
    stage = models.CharField(
        max_length=20, choices=Stage.choices, default=Stage.FINISHED_GOOD, blank=True
    )
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="products"
    )
    is_active = models.BooleanField(default=True)
    available_qty = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return f"{self.name} ({self.sku_code})"


class CustomerSKUMapping(BaseModel):
    """Which internal SKU a given customer's own SKU code refers to, plus
    how that SKU gets packed for this customer.

    A correctable lookup row, not an identity record like Product/Customer
    themselves — no active flag, deletable outright.

    Packing fields are deliberately plain scalars, never a live reference to
    anything else. A future Export Order Line must copy these values at
    order-creation time, not FK-reference this row — otherwise a later
    change here would silently rewrite historical orders (see
    docs/modules/export-orders/business-rules.md).
    """

    customer = models.ForeignKey(
        "customers.Customer", on_delete=models.CASCADE, related_name="sku_mappings"
    )
    customer_sku_code = models.CharField(max_length=64)
    customer_description = models.CharField(max_length=255, blank=True)
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name="customer_mappings")

    class CartonPlyRating(models.TextChoices):
        THREE_PLY = "3_PLY", "3-ply"
        FIVE_PLY = "5_PLY", "5-ply"

    # Packing configuration — all optional, filled in as the coordinator
    # learns them; nothing here should force placeholder values.
    pieces_per_pouch = models.PositiveIntegerField(null=True, blank=True)
    pouches_per_carton = models.PositiveIntegerField(null=True, blank=True)
    pouch_height_inches = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)

    # Carton configuration
    carton_ply_rating = models.CharField(max_length=10, choices=CartonPlyRating.choices, blank=True)
    carton_length_mm = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    carton_breadth_mm = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    carton_height_mm = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    carton_net_weight_kg = models.DecimalField(
        max_digits=8, decimal_places=2, null=True, blank=True
    )
    carton_gross_weight_kg = models.DecimalField(
        max_digits=8, decimal_places=2, null=True, blank=True
    )

    # Pouch configuration
    pouch_thickness_microns = models.DecimalField(
        max_digits=8, decimal_places=2, null=True, blank=True
    )
    pouch_length_mm = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    pouch_breadth_mm = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    pouch_height_mm = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)

    # Retail sticker / silica gel — nullable so "unanswered" is distinct
    # from an answered "No".
    has_retail_sticker = models.BooleanField(null=True, blank=True)
    retail_sticker_comments = models.TextField(blank=True)
    has_silica_gel = models.BooleanField(null=True, blank=True)

    other_packing_requirements = models.TextField(blank=True)

    class Meta:
        ordering = ["customer__name", "customer_sku_code"]
        constraints = [
            models.UniqueConstraint(
                fields=["customer", "customer_sku_code"], name="unique_customer_sku_code"
            )
        ]

    def __str__(self) -> str:
        return f"{self.customer} — {self.customer_sku_code} → {self.product.sku_code}"

    @property
    def pieces_per_carton(self) -> int | None:
        """Pieces per Pouch × Pouches per Carton — computed, never stored,
        so it can never drift out of sync with its two inputs."""
        if self.pieces_per_pouch is None or self.pouches_per_carton is None:
            return None
        return self.pieces_per_pouch * self.pouches_per_carton


class CustomerSKUMappingFile(BaseModel):
    """Reference images/files attached to a Customer SKU packing
    configuration — plate/pouch/design references, plus retail sticker
    images specifically. Scoped to this one model (FK, not a generic
    cross-app Attachments system) — same reasoning as
    `export_orders.ExportOrderPOVersion.document`: build what's asked, not
    a speculative generic system, until a second unrelated consumer
    actually needs one.
    """

    class Category(models.TextChoices):
        PLATE_IMAGE = "PLATE_IMAGE", "Plate Image"
        POUCH_IMAGE = "POUCH_IMAGE", "Pouch Image"
        DESIGN_FILE = "DESIGN_FILE", "Design File"
        RETAIL_STICKER_IMAGE = "RETAIL_STICKER_IMAGE", "Retail Sticker Image"

    customer_sku_mapping = models.ForeignKey(
        CustomerSKUMapping, on_delete=models.CASCADE, related_name="files"
    )
    category = models.CharField(max_length=32, choices=Category.choices)
    file = models.FileField(
        upload_to="customer_sku_mapping_files/",
        validators=[validate_upload_file_size, validate_upload_file_type],
    )

    class Meta:
        ordering = ["category", "created_at"]

    def __str__(self) -> str:
        return f"{self.customer_sku_mapping} — {self.get_category_display()}"
