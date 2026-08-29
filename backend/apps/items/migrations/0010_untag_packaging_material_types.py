from django.db import migrations

# Material Type is now hidden for Packaging Material (material doesn't vary
# within a packaging Product Type, confirmed with the business), so tagging
# a Material Type exclusively to that class — as migration 0009 did for
# Corrugated Paper/Sticker Paper — would make it permanently unreachable:
# nothing can select it, since the one class it's scoped to no longer shows
# the field at all. Clear that tag back to "no restriction" rather than
# leave dead data sitting in `applicable_item_classes`. Existing Items that
# already reference these rows (e.g. the "Carton" item using Corrugated
# Paper) are untouched — this only changes which classes' dropdowns offer
# them going forward.
NAMES_TO_UNTAG = ["Corrugated Paper", "Sticker Paper"]


def untag(apps, schema_editor):
    MaterialType = apps.get_model("items", "MaterialType")
    MaterialType.objects.filter(name__in=NAMES_TO_UNTAG).update(applicable_item_classes=[])


def retag(apps, schema_editor):
    MaterialType = apps.get_model("items", "MaterialType")
    MaterialType.objects.filter(name__in=NAMES_TO_UNTAG).update(
        applicable_item_classes=["PACKAGING_MATERIAL"]
    )


class Migration(migrations.Migration):

    dependencies = [
        ("items", "0009_tag_existing_material_types"),
    ]

    operations = [
        migrations.RunPython(untag, retag),
    ]
