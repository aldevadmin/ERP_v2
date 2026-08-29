from django.db import migrations

# Seeds `ItemFieldRule` with the exact rule set that was previously
# hardcoded in `_REQUIRED_FIELDS_BY_CLASS`/`_HIDDEN_FIELDS_BY_CLASS`
# (serializers.py) and `SHAPE_SCOPE_CLASSES`/`DIMENSION_SCOPE_CLASSES`
# (frontend namingTemplate.ts) — a straight data transplant, not a
# behavior change. Matches the business's "Items mapping" spreadsheet.
RULES = {
    "RAW_MATERIAL": {
        "product_type": "HIDDEN",
        "material_type": "REQUIRED",
        "shape": "HIDDEN",
        "dimensions": "HIDDEN",
    },
    "WIP": {
        "product_type": "REQUIRED",
        "material_type": "REQUIRED",
        "shape": "OPTIONAL",
        "dimensions": "OPTIONAL",
    },
    "FINISHED_GOOD": {
        "product_type": "REQUIRED",
        "material_type": "REQUIRED",
        "shape": "OPTIONAL",
        "dimensions": "OPTIONAL",
    },
    "PACKAGING_MATERIAL": {
        "product_type": "REQUIRED",
        "material_type": "HIDDEN",
        "shape": "HIDDEN",
        "dimensions": "OPTIONAL",
    },
    "CONSUMABLE": {
        "product_type": "OPTIONAL",
        "material_type": "HIDDEN",
        "shape": "HIDDEN",
        "dimensions": "HIDDEN",
    },
    "SCRAP_BY_PRODUCT": {
        "product_type": "OPTIONAL",
        "material_type": "OPTIONAL",
        "shape": "HIDDEN",
        "dimensions": "HIDDEN",
    },
}


def seed_rules(apps, schema_editor):
    ItemFieldRule = apps.get_model("items", "ItemFieldRule")
    Organization = apps.get_model("core", "Organization")
    organization = Organization.objects.first()
    if organization is None:
        return
    ItemFieldRule.objects.bulk_create(
        [
            ItemFieldRule(
                organization=organization, item_class=item_class, field=field, state=state
            )
            for item_class, fields in RULES.items()
            for field, state in fields.items()
        ]
    )


def remove_rules(apps, schema_editor):
    ItemFieldRule = apps.get_model("items", "ItemFieldRule")
    ItemFieldRule.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ("items", "0012_itemfieldrule"),
    ]

    operations = [
        migrations.RunPython(seed_rules, remove_rules),
    ]
