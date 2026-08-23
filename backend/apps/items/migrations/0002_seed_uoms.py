from django.db import migrations

# Starting set covering this business's actual packaging math (pieces,
# weight, pouches, cartons) — a starting point admins can extend/rename
# from Settings, not a closed list.
UOMS = [
    ("PC", "Piece", 0),
    ("KG", "Kilogram", 3),
    ("POUCH", "Pouch", 0),
    ("CARTON", "Carton", 0),
]


def seed_uoms(apps, schema_editor):
    Organization = apps.get_model("core", "Organization")
    UOM = apps.get_model("items", "UOM")

    organization = Organization.objects.get(name="Default Organization")
    for code, name, decimal_scale in UOMS:
        UOM.objects.get_or_create(
            code=code,
            defaults={"name": name, "decimal_scale": decimal_scale, "organization": organization},
        )


def remove_uoms(apps, schema_editor):
    UOM = apps.get_model("items", "UOM")
    UOM.objects.filter(code__in=[code for code, _, _ in UOMS]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("items", "0001_initial"),
        ("core", "0002_seed_default_organization"),
    ]

    operations = [
        migrations.RunPython(seed_uoms, remove_uoms),
    ]
