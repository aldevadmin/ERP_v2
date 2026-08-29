from django.db import migrations

# One-time backfill for rows that existed before `applicable_item_classes`
# did — tags this dev environment's actual Material Type names per an
# explicit product-vs-packaging decision made with the user (PET Plastic
# deliberately left untagged/ambiguous, per that same conversation). A
# no-op wherever these exact names don't exist, so it's harmless to run
# against any other database.
PRODUCT_MATERIAL_CLASSES = ["RAW_MATERIAL", "WIP", "FINISHED_GOOD"]
PRODUCT_MATERIAL_NAMES = ["Areca Palm", "Palm", "Bagasse", "Veneer", "Wood"]

PACKAGING_MATERIAL_CLASSES = ["PACKAGING_MATERIAL"]
PACKAGING_MATERIAL_NAMES = ["Corrugated Paper", "Sticker Paper"]


def tag_material_types(apps, schema_editor):
    MaterialType = apps.get_model("items", "MaterialType")
    MaterialType.objects.filter(name__in=PRODUCT_MATERIAL_NAMES).update(
        applicable_item_classes=PRODUCT_MATERIAL_CLASSES
    )
    MaterialType.objects.filter(name__in=PACKAGING_MATERIAL_NAMES).update(
        applicable_item_classes=PACKAGING_MATERIAL_CLASSES
    )


def untag_material_types(apps, schema_editor):
    MaterialType = apps.get_model("items", "MaterialType")
    MaterialType.objects.filter(
        name__in=PRODUCT_MATERIAL_NAMES + PACKAGING_MATERIAL_NAMES
    ).update(applicable_item_classes=[])


class Migration(migrations.Migration):

    dependencies = [
        ("items", "0008_materialtype_applicable_item_classes"),
    ]

    operations = [
        migrations.RunPython(tag_material_types, untag_material_types),
    ]
