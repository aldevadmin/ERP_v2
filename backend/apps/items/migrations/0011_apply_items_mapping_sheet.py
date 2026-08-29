from django.db import migrations

# Reconciles Product Type / Material Type tagging against the business's
# "Items mapping" spreadsheet, and fixes drift that had crept in since
# 0009/0010 through manual edits via the (now read-only) Applies To field:
# Packaging Material's Corrugated Paper/Sticker Paper tags had been
# re-added even though Material Type is hidden for that class, and PET
# Plastic had picked up the same dead tag alongside a legitimate one.

PRODUCT_TYPE_WIP_FG_NAMES = ["Cup", "Lid", "Plate", "Tray"]
# Bowl already carries this from earlier manual tagging — not touched here.
PRODUCT_TYPE_WIP_FG_PREVIOUS = {
    "Cup": ["FINISHED_GOOD"],
    "Lid": ["FINISHED_GOOD"],
    "Plate": ["FINISHED_GOOD"],
    "Tray": ["FINISHED_GOOD"],
}

MATERIAL_TYPE_PACKAGING_DEAD_TAGS_PREVIOUS = {
    "Corrugated Paper": ["PACKAGING_MATERIAL"],
    "Sticker Paper": ["PACKAGING_MATERIAL"],
    "PET Plastic": ["PACKAGING_MATERIAL", "FINISHED_GOOD"],
}
MATERIAL_TYPE_PACKAGING_DEAD_TAGS_NEW = {
    "Corrugated Paper": [],
    "Sticker Paper": [],
    "PET Plastic": ["FINISHED_GOOD"],
}


def apply_mapping(apps, schema_editor):
    Item = apps.get_model("items", "Item")
    MaterialType = apps.get_model("items", "MaterialType")
    ProductType = apps.get_model("items", "ProductType")

    ProductType.objects.filter(name__in=PRODUCT_TYPE_WIP_FG_NAMES).update(
        applicable_item_classes=["WIP", "FINISHED_GOOD"]
    )

    for name, classes in MATERIAL_TYPE_PACKAGING_DEAD_TAGS_NEW.items():
        MaterialType.objects.filter(name=name).update(applicable_item_classes=classes)

    # "Areca Palm" and "Palm" were confirmed to be the same material —
    # consolidate onto "Palm" (the name the mapping sheet actually uses),
    # reassigning the one Item that referenced "Areca Palm" first so the
    # PROTECT foreign key doesn't block deactivating it. Deactivated, not
    # deleted — reversible, and any historical report keying off the old
    # id still resolves.
    try:
        areca_palm = MaterialType.objects.get(name="Areca Palm")
        palm = MaterialType.objects.get(name="Palm")
    except MaterialType.DoesNotExist:
        return
    Item.objects.filter(material_type=areca_palm).update(material_type=palm)
    areca_palm.is_active = False
    areca_palm.save(update_fields=["is_active"])


def revert_mapping(apps, schema_editor):
    Item = apps.get_model("items", "Item")
    MaterialType = apps.get_model("items", "MaterialType")
    ProductType = apps.get_model("items", "ProductType")

    for name, classes in PRODUCT_TYPE_WIP_FG_PREVIOUS.items():
        ProductType.objects.filter(name=name).update(applicable_item_classes=classes)

    for name, classes in MATERIAL_TYPE_PACKAGING_DEAD_TAGS_PREVIOUS.items():
        MaterialType.objects.filter(name=name).update(applicable_item_classes=classes)

    try:
        areca_palm = MaterialType.objects.get(name="Areca Palm")
    except MaterialType.DoesNotExist:
        return
    areca_palm.is_active = True
    areca_palm.save(update_fields=["is_active"])
    Item.objects.filter(name="Raw Areca Leaf").update(material_type=areca_palm)


class Migration(migrations.Migration):

    dependencies = [
        ("items", "0010_untag_packaging_material_types"),
    ]

    operations = [
        migrations.RunPython(apply_mapping, revert_mapping),
    ]
