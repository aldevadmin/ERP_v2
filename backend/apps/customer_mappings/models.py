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


class CustomerProductMapping(BaseModel):
    """Which customer buys which finished `Item`, and under what
    commercial/packing terms — replaces `products.CustomerSKUMapping`.
    Stable identity; the actual commercial terms live on
    `CustomerProductMappingVersion` below (same split as
    `processes.ProcessDefinition`/`Version`), so a historical Export Order
    Line can snapshot a specific immutable published version rather than a
    freely-editable row that could silently change later.

    `customer_sku` is the discriminator, not `item` — a customer can have
    several simultaneous mappings for the same item (e.g. two pack sizes
    sold as two different SKUs), but never two mappings sharing one SKU.
    `UniqueConstraint(customer, customer_sku)` enforces this; `customer_sku`
    is fixed at creation (immutable — enforced in `views.py`) since it's
    part of this row's identity, not just a commercial detail that can
    drift across versions.
    """

    customer = models.ForeignKey(
        "customers.Customer", on_delete=models.CASCADE, related_name="product_mappings"
    )
    item = models.ForeignKey(
        "items.Item", on_delete=models.PROTECT, related_name="product_mappings"
    )
    customer_sku = models.CharField(max_length=64)
    mapping_code = models.CharField(max_length=32, unique=True)
    is_active = models.BooleanField(default=True)
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="customer_product_mappings"
    )

    class Meta:
        ordering = ["customer__name", "item__name"]
        constraints = [
            models.UniqueConstraint(
                fields=["customer", "customer_sku"], name="one_mapping_per_customer_sku"
            )
        ]

    def __str__(self) -> str:
        return f"{self.customer} — {self.customer_sku} ({self.item.code})"

    def current_version(self) -> "CustomerProductMappingVersion | None":
        return (
            self.versions.filter(status=CustomerProductMappingVersion.Status.PUBLISHED).first()
            or self.versions.first()
        )


class CustomerProductMappingVersion(BaseModel):
    """One versioned commercial/packing snapshot of a
    `CustomerProductMapping`. Only a `DRAFT` version may be edited — once
    `PUBLISHED`, immutable (enforced in `views.py`), since Export Order
    Lines snapshot from a specific published version and must never have
    their commercial facts silently reinterpreted. `packaging_profile_version`
    pins a specific `packaging.PackagingProfileVersion` (never the mutable
    profile) for the same reason — republishing packaging must never
    silently change an already-approved mapping.

    `customer_sku` lives on the parent `CustomerProductMapping`, not here —
    it's part of that row's identity, not a per-version commercial detail.
    """

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        PUBLISHED = "PUBLISHED", "Published"
        RETIRED = "RETIRED", "Retired"

    mapping = models.ForeignKey(
        CustomerProductMapping, on_delete=models.CASCADE, related_name="versions"
    )
    version_number = models.PositiveIntegerField()
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    effective_from = models.DateField(null=True, blank=True)
    effective_to = models.DateField(null=True, blank=True)

    customer_description = models.CharField(max_length=255, blank=True)
    packaging_profile_version = models.ForeignKey(
        "packaging.PackagingProfileVersion",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="customer_mapping_versions",
    )
    selling_uom = models.ForeignKey(
        "items.UOM", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    unit_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    currency = models.CharField(max_length=3, blank=True)
    barcode = models.CharField(max_length=64, blank=True)

    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.PROTECT,
        related_name="customer_product_mapping_versions",
    )

    class Meta:
        ordering = ["-version_number"]
        constraints = [
            models.UniqueConstraint(
                fields=["mapping", "version_number"], name="unique_version_per_mapping"
            )
        ]

    def __str__(self) -> str:
        return f"{self.mapping} v{self.version_number} ({self.status})"


class MappingRequirement(BaseModel):
    """One structured requirement row (a label spec, a compliance
    document, a pallet instruction, ...) on a `CustomerProductMappingVersion`
    — deliberately structured key/value rows, not one free-text notes
    field, so requirements can be listed, filtered, and checked off rather
    than buried in prose.
    """

    class Category(models.TextChoices):
        LABEL = "LABEL", "Label"
        DOCUMENT = "DOCUMENT", "Document"
        QUALITY = "QUALITY", "Quality"
        PALLET = "PALLET", "Pallet"
        COMPLIANCE = "COMPLIANCE", "Compliance"
        OTHER = "OTHER", "Other"

    version = models.ForeignKey(
        CustomerProductMappingVersion, on_delete=models.CASCADE, related_name="requirements"
    )
    category = models.CharField(max_length=12, choices=Category.choices)
    key = models.CharField(max_length=100)
    value = models.CharField(max_length=500, blank=True)
    is_required = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=0)
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="mapping_requirements"
    )

    class Meta:
        ordering = ["sort_order", "id"]

    def __str__(self) -> str:
        return f"{self.key} ({self.category})"


class MappingFile(BaseModel):
    """Reference images/files attached to a mapping version — plate/pouch
    /design references, retail sticker images. Replaces
    `products.CustomerSKUMappingFile`, same shape.
    """

    class Category(models.TextChoices):
        PLATE_IMAGE = "PLATE_IMAGE", "Plate Image"
        POUCH_IMAGE = "POUCH_IMAGE", "Pouch Image"
        DESIGN_FILE = "DESIGN_FILE", "Design File"
        RETAIL_STICKER_IMAGE = "RETAIL_STICKER_IMAGE", "Retail Sticker Image"

    version = models.ForeignKey(
        CustomerProductMappingVersion, on_delete=models.CASCADE, related_name="files"
    )
    category = models.CharField(max_length=32, choices=Category.choices)
    file = models.FileField(
        upload_to="customer_mapping_files/",
        validators=[validate_upload_file_size, validate_upload_file_type],
    )

    class Meta:
        ordering = ["category", "created_at"]

    def __str__(self) -> str:
        return f"{self.version} — {self.get_category_display()}"
