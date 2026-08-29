from django.db import migrations

# Starting vocabulary lifted directly from the user's own historical SKU
# convention (Guidelines for SKU sheet) — a configurable master, not a
# hard-coded enum, so admins can rename/extend these from Settings.
SHAPES = [
    ("Round", "RD"),
    ("Square", "SQ"),
    ("Rectangle", "RE"),
    ("Oval", "OV"),
    ("Special", "SP"),
    ("Container", "CN"),
    ("Triangle", "TG"),
]


def seed_shapes(apps, schema_editor):
    Organization = apps.get_model("core", "Organization")
    Shape = apps.get_model("items", "Shape")

    organization = Organization.objects.get(name="Default Organization")
    for name, short_code in SHAPES:
        Shape.objects.get_or_create(
            name=name, defaults={"short_code": short_code, "organization": organization}
        )


def remove_shapes(apps, schema_editor):
    Shape = apps.get_model("items", "Shape")
    Shape.objects.filter(name__in=[name for name, _ in SHAPES]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("items", "0004_item_breadth_in_item_height_mm_item_length_in_and_more"),
    ]

    operations = [
        migrations.RunPython(seed_shapes, remove_shapes),
    ]
