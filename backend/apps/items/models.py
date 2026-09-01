from django.contrib.postgres.fields import ArrayField
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


class Shape(BaseModel):
    """A configurable lookup for `Item.shape` (Round, Square, Rectangle,
    Oval, Special, Container, Triangle, ...) — same shape/reasoning as
    `ProductType`. Deliberately separate from `ProductType`: a Tray can be
    Rectangle or Square independently of being a Tray, so the two vary on
    independent axes.
    """

    name = models.CharField(max_length=100, unique=True)
    short_code = models.CharField(max_length=4, blank=True)
    is_active = models.BooleanField(default=True)
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="shapes"
    )

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "shapes"

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

    `item_class` itself stays a code-level enum, not a master — an admin
    picking a *new* class from a dropdown still wouldn't correspond to any
    real behavior (routing, capability flags, Export Order eligibility are
    all coded per specific class elsewhere). `product_type`/`material_type`
    ARE real masters (`ProductType`/`MaterialType`, both defined below)
    since they're pure descriptive labels with no branching logic attached.

    Which of product_type/material_type/shape/dimensions are
    Required/Optional/Hidden *per class*, however, IS admin-configurable —
    see `ItemFieldRule` below. (`inventory_uom` and the usage/lot-tracking/
    active fields are always required for every class, with no demonstrated
    need to vary, so they're not part of that table — see its docstring.)
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

    class DimensionUOM(models.TextChoices):
        IN = "IN", "Inches"
        CM = "CM", "Centimeters"
        MM = "MM", "Millimeters"

    code = models.CharField(max_length=32, unique=True)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    item_class = models.CharField(max_length=20, choices=ItemClass.choices)
    product_type = models.ForeignKey(
        "ProductType", on_delete=models.PROTECT, null=True, blank=True, related_name="items"
    )
    material_type = models.ForeignKey(
        "MaterialType", on_delete=models.PROTECT, null=True, blank=True, related_name="items"
    )
    shape = models.ForeignKey(
        Shape, on_delete=models.PROTECT, null=True, blank=True, related_name="items"
    )
    # Physical dimensions — optional on every class, only ever populated
    # where meaningful (chiefly Finished Good/WIP/Packaging Material).
    # Purely descriptive/for `NamingTemplate` suggestions; nothing here
    # branches on their presence. Each has its own unit, not one shared
    # unit for all three — Length/Breadth and Height genuinely vary
    # independently in practice (e.g. a plate's diameter in inches vs. its
    # thickness in mm), and Packaging Material commonly wants all three in
    # mm. The form defaults length/breadth to Inches and height to
    # Millimeters for every class except Packaging Material (all three
    # default Millimeters there), but every one of the three is a real,
    # independently-editable per-item field, not inferred from class at
    # read time.
    length = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    breadth = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    height = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    length_uom = models.CharField(max_length=2, choices=DimensionUOM.choices, null=True, blank=True)
    breadth_uom = models.CharField(max_length=2, choices=DimensionUOM.choices, null=True, blank=True)
    height_uom = models.CharField(max_length=2, choices=DimensionUOM.choices, null=True, blank=True)
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


class ItemFieldRule(BaseModel):
    """Whether `product_type`/`material_type`/`shape`/`dimensions` is
    Required, Optional (shown, not mandatory), or Hidden for a given
    `Item.item_class` — admin-configurable via the Item Classification
    settings screen. Replaces what used to be hardcoded
    `_REQUIRED_FIELDS_BY_CLASS`/`_HIDDEN_FIELDS_BY_CLASS` dicts in
    `ItemSerializer`; `ItemSerializer.validate()` now reads the live rule
    set from here instead. This deliberately reverses part of the
    reasoning in `Item`'s own docstring (which keeps `item_class` itself a
    fixed enum) — the business explicitly asked for this specific axis to
    be configurable, matching an internal spreadsheet they maintain.

    Only these four class-varying fields are modeled. `inventory_uom`, the
    usage flags (purchasable/manufacturable/stockable/sellable),
    `lot_tracking`, and `is_active` are required/shown for every class
    today with no demonstrated need to vary — giving them rows here too
    would be speculative infrastructure with nothing to configure, so they
    stay hardcoded and appear in the settings screen as a read-only
    reference instead.

    All four rows offer the same Required/Optional/Hidden choice — the
    settings screen deliberately doesn't restrict Shape/Dimensions to
    Optional/Hidden only, since a dropdown that silently drops an option
    depending on which row it's in is worse than one that's occasionally a
    business decision an admin might not want. `dimensions` REQUIRED
    enforces `length`+`height` only, never `breadth` — a round
    item legitimately has no breadth even when dimensions otherwise matter
    (see `buildDimensionToken` on the frontend, which treats length+height
    as the real minimum for a usable dimension).
    """

    class Field(models.TextChoices):
        PRODUCT_TYPE = "product_type", "Product Type"
        MATERIAL_TYPE = "material_type", "Material"
        SHAPE = "shape", "Shape"
        DIMENSIONS = "dimensions", "Dimensions"

    class State(models.TextChoices):
        REQUIRED = "REQUIRED", "Required"
        OPTIONAL = "OPTIONAL", "Optional"
        HIDDEN = "HIDDEN", "Hidden"

    item_class = models.CharField(max_length=20, choices=Item.ItemClass.choices)
    field = models.CharField(max_length=20, choices=Field.choices)
    state = models.CharField(max_length=10, choices=State.choices)
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="item_field_rules"
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "item_class", "field"], name="unique_item_field_rule"
            )
        ]
        ordering = ["item_class", "field"]

    def __str__(self) -> str:
        return f"{self.get_item_class_display()} — {self.get_field_display()}: {self.state}"


class ProductType(BaseModel):
    """A configurable lookup for `Item.product_type` (e.g. Plate, Bowl,
    Tray, Carton, Pouch) — a real master, not a hard-coded enum, since
    these labels carry no fixed meaning the code should ever branch on.
    Same shape as `apps.processes.ProcessCategory`. Defined after `Item`
    (unlike `Shape`, which doesn't need this) purely so
    `applicable_item_classes` below can reference `Item.ItemClass`;
    `Item.product_type` refers back to this via a lazy `"ProductType"`
    string, which is why the ordering doesn't matter for that direction.

    `short_code` is optional — a 2-4 letter abbreviation (e.g. "PL" for
    Plate) used only as a `NamingTemplate` token; existing rows aren't
    broken by leaving it blank.

    `applicable_item_classes` scopes which `Item.item_class` values a type
    is offered for on the Item form — e.g. Plate/Bowl/Tray only make sense
    for WIP/Finished Good, Carton/Pouch/Label only for Packaging Material.
    Empty means "no restriction, offered for every class" — the safe
    default so rows created before this field existed keep working
    everywhere without a backfill. This is a frontend display filter only
    (`isProductTypeApplicable` in the frontend's `types.ts`), not a
    server-side restriction — the API still accepts any active
    `ProductType` regardless of the item's class, same as before this
    field existed; nothing here should start rejecting requests on it.
    """

    name = models.CharField(max_length=100, unique=True)
    short_code = models.CharField(max_length=4, blank=True)
    applicable_item_classes = ArrayField(
        models.CharField(max_length=20, choices=Item.ItemClass.choices),
        default=list,
        blank=True,
    )
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
    Wood, Corrugated Paper) — same shape and reasoning as `ProductType`,
    including why it's defined after `Item` (`applicable_item_classes`
    below needs `Item.ItemClass`; `Item.material_type` refers back via a
    lazy `"MaterialType"` string).

    `short_code` — same purpose as `ProductType.short_code` above.

    `applicable_item_classes` — same purpose as `ProductType`'s: e.g. Areca
    Palm/Wood only make sense for Raw Material/WIP/Finished Good,
    Corrugated Paper/Sticker Paper only for Packaging Material. Empty means
    "no restriction." Frontend display filter only, same as `ProductType`'s
    — see that field's docstring for the full reasoning.
    """

    name = models.CharField(max_length=100, unique=True)
    short_code = models.CharField(max_length=4, blank=True)
    applicable_item_classes = ArrayField(
        models.CharField(max_length=20, choices=Item.ItemClass.choices),
        default=list,
        blank=True,
    )
    is_active = models.BooleanField(default=True)
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="material_types"
    )

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "material types"

    def __str__(self) -> str:
        return self.name


class NamingTemplate(BaseModel):
    """A configurable pattern for suggesting an Item's Name/Code, scoped to
    an `item_class` and optionally narrowed further by `product_type`
    and/or `shape`. Resolution (`resolveNamingTemplate` in the frontend's
    `namingTemplate.ts` — this is a frontend-only computation, there's no
    backend resolution service) prefers whichever active, class-matching
    template has the most optional scopes set and matching the item.

    Patterns are plain text with `{token}` placeholders (`class`,
    `class_short`, `length`, `breadth`, `height`, `dimension`,
    `product_type`, `product_type_short`, `material_type`,
    `material_type_short`, `shape`, `shape_short`, `uom`) —
    substituted entirely on the frontend from the Item form's current
    values, so this table only stores the pattern itself, never a computed
    result. No template configured for a class/type is the normal,
    unconfigured state — Name/Code stay purely manual until an admin adds
    one, so this is purely additive.

    `product_type` is only accepted as a scope for classes where the Item
    form actually lets Product Type be set — the serializer nulls it out
    otherwise (same `_HIDDEN_FIELDS_BY_CLASS` rule `ItemSerializer` uses),
    since a scope value no item of that class can ever carry would make the
    template permanently, silently unmatchable.

    `shape` is a second, independent optional scope alongside
    `product_type` — deliberately not restricted to `product_type`'s
    values, since the thing that actually varies with shape (how many
    dimensions the `{dimension}` token needs) cuts across product types: a
    round Bowl and a round Cup want the same dimension handling, a round
    Bowl and a square Bowl don't. Only meaningful for WIP/Finished Good,
    same as `Item.shape` itself — the frontend hides the field for every
    other class. Resolution (`resolveNamingTemplate` on the frontend)
    prefers whichever active, class-matching template has the most of its
    optional scopes (`product_type`, `shape`) set and matching the item;
    a template's non-null scope fields must equal the item's values to be
    eligible at all, they never narrow via mismatch.
    """

    item_class = models.CharField(max_length=20, choices=Item.ItemClass.choices)
    product_type = models.ForeignKey(
        ProductType, on_delete=models.CASCADE, null=True, blank=True, related_name="+"
    )
    shape = models.ForeignKey(
        Shape, on_delete=models.CASCADE, null=True, blank=True, related_name="+"
    )
    name_pattern = models.CharField(max_length=255, blank=True)
    code_pattern = models.CharField(max_length=255, blank=True)
    is_active = models.BooleanField(default=True)
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="naming_templates"
    )

    class Meta:
        ordering = ["item_class", "product_type__name", "shape__name"]
        # No DB-level uniqueness constraint here — with two independent
        # optional scopes (product_type, shape), the matrix of partial
        # indexes needed to express "unique per class + each null
        # combination" grows awkwardly. Exact-duplicate-scope is instead
        # checked in the serializer's `validate()`, the same place that
        # already has to own this check (DRF can't auto-derive a
        # validator for a conditional constraint anyway — see the
        # `product_type`-only version of this rule that was here before
        # `shape` was added).

    def __str__(self) -> str:
        scope = self.product_type.name if self.product_type else "all product types"
        return f"{self.get_item_class_display()} — {scope}"
