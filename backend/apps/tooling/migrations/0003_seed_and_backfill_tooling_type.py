from django.db import migrations

# The 7 values the old CharField(choices=) enum offered — now a starting
# point admins can extend/rename from Settings, not a closed list.
TYPE_NAMES = ["Mould", "Die", "Jig", "Fixture", "Cutting Tool", "Forming Tool", "Other"]

# Old CharField value -> new ToolingType.name, for backfilling existing rows.
OLD_VALUE_TO_NAME = {
    "MOULD": "Mould",
    "DIE": "Die",
    "JIG": "Jig",
    "FIXTURE": "Fixture",
    "CUTTING_TOOL": "Cutting Tool",
    "FORMING_TOOL": "Forming Tool",
    "OTHER": "Other",
}


def seed_and_backfill(apps, schema_editor):
    Organization = apps.get_model("core", "Organization")
    ToolingType = apps.get_model("tooling", "ToolingType")
    Tooling = apps.get_model("tooling", "Tooling")

    organization = Organization.objects.get(name="Default Organization")
    for name in TYPE_NAMES:
        ToolingType.objects.get_or_create(name=name, defaults={"organization": organization})

    for old_value, name in OLD_VALUE_TO_NAME.items():
        tooling_type = ToolingType.objects.get(name=name)
        Tooling.objects.filter(tooling_type=old_value).update(tooling_type_fk=tooling_type)


def reverse(apps, schema_editor):
    ToolingType = apps.get_model("tooling", "ToolingType")
    ToolingType.objects.filter(name__in=TYPE_NAMES).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("tooling", "0002_toolingtype_tooling_tooling_type_fk"),
        ("core", "0002_seed_default_organization"),
    ]

    operations = [
        migrations.RunPython(seed_and_backfill, reverse),
    ]
