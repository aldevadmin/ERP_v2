from django.db import migrations

# Free-text unit strings this business's existing Material/Product data
# actually uses, mapped onto the UOM codes seeded in 0002_seed_uoms. Matching
# also tries an exact case-insensitive match against UOM.code/UOM.name first,
# so this list only needs to cover abbreviations/variants that wouldn't
# otherwise match (e.g. "pcs", "Kg").
UNIT_ALIASES = {
    "pc": "PC",
    "pcs": "PC",
    "piece": "PC",
    "pieces": "PC",
    "kg": "KG",
    "kgs": "KG",
    "kilogram": "KG",
    "kilograms": "KG",
    "pouch": "POUCH",
    "pouches": "POUCH",
    "carton": "CARTON",
    "cartons": "CARTON",
}


def resolve_uom(UOM, organization, unit_text, cache):
    """Resolve a free-text unit string (Material.unit / Product.base_unit)
    to a UOM row, creating one if nothing matches. Never drops the source
    value silently — an unrecognized unit becomes its own new UOM (visible
    and editable from Settings afterwards) rather than being guessed wrong.
    """
    text = (unit_text or "").strip()
    if not text:
        return None
    key = text.lower()
    if key in cache:
        return cache[key]

    uom = UOM.objects.filter(code__iexact=text).first() or UOM.objects.filter(
        name__iexact=text
    ).first()
    if uom is None:
        alias_code = UNIT_ALIASES.get(key)
        if alias_code:
            uom = UOM.objects.filter(code=alias_code).first()
    if uom is None:
        code = text.upper()[:20]
        uom, _ = UOM.objects.get_or_create(
            code=code,
            defaults={"name": text, "decimal_scale": 0, "organization": organization},
        )
    cache[key] = uom
    return uom


def migrate_materials_and_products(apps, schema_editor):
    Material = apps.get_model("materials", "Material")
    Product = apps.get_model("products", "Product")
    Item = apps.get_model("items", "Item")
    UOM = apps.get_model("items", "UOM")

    material_codes = set(Material.objects.values_list("code", flat=True))
    product_skus = set(Product.objects.values_list("sku_code", flat=True))
    collisions = material_codes & product_skus
    if collisions:
        raise RuntimeError(
            "Cannot migrate Material/Product into Item: the following codes exist as "
            f"both a Material.code and a Product.sku_code, which would collide in "
            f"Item's single unique code namespace: {sorted(collisions)}. Rename one "
            "side before re-running this migration."
        )

    uom_cache: dict[str, object] = {}

    category_to_class = {
        "RAW_MATERIAL": "RAW_MATERIAL",
        "PACKAGING": "PACKAGING_MATERIAL",
    }
    for material in Material.objects.all():
        item_class = category_to_class.get(material.category, "RAW_MATERIAL")
        Item.objects.create(
            code=material.code,
            name=material.name,
            description="",
            item_class=item_class,
            product_type=None,
            material_type=None,
            inventory_uom=resolve_uom(UOM, material.organization, material.unit, uom_cache),
            purchasable=True,
            manufacturable=False,
            stockable=True,
            sellable=False,
            lot_tracking="NONE",
            is_active=material.is_active,
            available_qty=0,
            organization=material.organization,
        )

    stage_to_class = {
        "SEMI_FINISHED": "WIP",
        "FINISHED_GOOD": "FINISHED_GOOD",
    }
    for product in Product.objects.all():
        item_class = stage_to_class.get(product.stage, "FINISHED_GOOD")
        sellable = item_class == "FINISHED_GOOD"
        Item.objects.create(
            code=product.sku_code,
            name=product.name,
            description=product.description,
            item_class=item_class,
            product_type=None,
            material_type=None,
            inventory_uom=resolve_uom(UOM, product.organization, product.base_unit, uom_cache),
            purchasable=False,
            manufacturable=True,
            stockable=True,
            sellable=sellable,
            lot_tracking="NONE",
            is_active=product.is_active,
            available_qty=product.available_qty,
            organization=product.organization,
        )


def remove_migrated_items(apps, schema_editor):
    # Reverse only undoes this migration's own writes. It does not restore
    # the original Material/Product rows to any prior state (they were never
    # modified) and it does not attempt to reconstruct which Item rows
    # downstream FKs may have since started pointing at — reversing after
    # later phases have repointed those FKs would orphan them. Only safe to
    # run immediately after this migration, before any later migration.
    Material = apps.get_model("materials", "Material")
    Product = apps.get_model("products", "Product")
    Item = apps.get_model("items", "Item")

    codes = set(Material.objects.values_list("code", flat=True)) | set(
        Product.objects.values_list("sku_code", flat=True)
    )
    Item.objects.filter(code__in=codes).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("items", "0002_seed_uoms"),
        ("materials", "0002_material_category"),
        ("products", "0005_product_stage"),
    ]

    operations = [
        migrations.RunPython(migrate_materials_and_products, remove_migrated_items),
    ]
