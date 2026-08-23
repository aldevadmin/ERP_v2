from django.db import models

from apps.core.models import BaseModel


class UOM(BaseModel):
    """A unit-of-measure master (Piece, Kg, Pouch, Carton, ...) — replaces
    the free-text `base_unit`/`unit` fields the old Product/Material models
    used. Kept as a real master — same shape as `apps.processes.ProcessCategory`
    — rather than free text, since packaging math and selling-UOM
    compatibility checks need a governed, referenceable unit list.
    """

    code = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=100)
    decimal_scale = models.PositiveSmallIntegerField(
        default=0
    )  # 0 = whole units only (e.g. Piece, Carton); >0 for fractional units (e.g. Kg)
    is_active = models.BooleanField(default=True)
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="uoms"
    )

    class Meta:
        ordering = ["name"]
        verbose_name = "UOM"
        verbose_name_plural = "UOMs"

    def __str__(self) -> str:
        return f"{self.name} ({self.code})"


class ProductType(BaseModel):
    """A configurable lookup for `Item.product_type` (e.g. Plate, Bowl,
    Tray) — a real master, not a hard-coded enum, since these labels carry
    no fixed meaning the code should ever branch on. Same shape as
    `apps.processes.ProcessCategory`.
    """

    name = models.CharField(max_length=100, unique=True)
    is_active = models.BooleanField(default=True)
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="product_types"
    )

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "product types"

    def __str__(self) -> str:
        return self.name


class MaterialType(BaseModel):
    """A configurable lookup for `Item.material_type` (e.g. Areca Palm,
    Wood Veneer, Paper) — same shape and reasoning as `ProductType`.
    """

    name = models.CharField(max_length=100, unique=True)
    is_active = models.BooleanField(default=True)
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="material_types"
    )

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "material types"

    def __str__(self) -> str:
        return self.name


class Item(BaseModel):
    """The universal item master — raw materials, WIP, finished goods,
    packaging materials, consumables, and scrap/by-products all live here,
    distinguished by `item_class`, rather than in separate tables per class.
    Replaces the former `apps.materials.Material` and `apps.products.Product`
    (merged in a follow-up migration) and is referenced by
    `apps.processes.ProcessInputDefinition`/`ProcessOutputDefinition`,
    `apps.tooling.ToolingCompatibility`/`ToolingAssignment`,
    `apps.product_routes.ProcessRoute`, and `apps.export_orders.ExportOrderLine`.

    `item_class` stays a code-level enum, not a master — it drives real
    conditional validation (which fields are required/hidden below), so
    promoting it to editable data would let someone select a "class" with no
    corresponding validation/UI behavior. `product_type`/`material_type` ARE
    real masters (`ProductType`/`MaterialType` above) since they're pure
    descriptive labels with no branching logic attached.

    Required/hidden fields by class (enforced server-side in the write
    serializer, mirrored by the frontend form):
      RAW_MATERIAL       — material_type + inventory_uom required; product_type hidden
      WIP                — product_type + material_type + inventory_uom required
      FINISHED_GOOD       — product_type + material_type + inventory_uom required
      PACKAGING_MATERIAL — product_type + material_type + inventory_uom required
      CONSUMABLE          — inventory_uom required; product_type/material_type optional
      SCRAP_BY_PRODUCT    — inventory_uom required; product_type/material_type optional
    """

    class ItemClass(models.TextChoices):
        RAW_MATERIAL = "RAW_MATERIAL", "Raw Material"
        WIP = "WIP", "WIP"
        FINISHED_GOOD = "FINISHED_GOOD", "Finished Good"
        PACKAGING_MATERIAL = "PACKAGING_MATERIAL", "Packaging Material"
        CONSUMABLE = "CONSUMABLE", "Consumable"
        SCRAP_BY_PRODUCT = "SCRAP_BY_PRODUCT", "Scrap / By-Product"

    class LotTracking(models.TextChoices):
        NONE = "NONE", "None"
        OPTIONAL = "OPTIONAL", "Optional"
        REQUIRED = "REQUIRED", "Required"

    code = models.CharField(max_length=32, unique=True)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    item_class = models.CharField(max_length=20, choices=ItemClass.choices)
    product_type = models.ForeignKey(
        ProductType, on_delete=models.PROTECT, null=True, blank=True, related_name="items"
    )
    material_type = models.ForeignKey(
        MaterialType, on_delete=models.PROTECT, null=True, blank=True, related_name="items"
    )
    inventory_uom = models.ForeignKey(
        UOM, on_delete=models.PROTECT, null=True, blank=True, related_name="items"
    )
    purchasable = models.BooleanField(default=False)
    manufacturable = models.BooleanField(default=False)
    stockable = models.BooleanField(default=False)
    sellable = models.BooleanField(default=False)
    lot_tracking = models.CharField(
        max_length=10, choices=LotTracking.choices, default=LotTracking.NONE
    )
    is_active = models.BooleanField(default=True)
    # Manually-adjusted "available finished stock" placeholder, carried over
    # from `products.Product.available_qty` — touched only by the Export
    # Order Loading workflow's stock-return reconciliation
    # (`export_orders.ExportOrderLine.sync_stock_return()`), not a
    # general-purpose stock field. A real Inventory module will eventually
    # own this properly.
    available_qty = models.PositiveIntegerField(default=0)
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="items"
    )

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return f"{self.name} ({self.code})"
