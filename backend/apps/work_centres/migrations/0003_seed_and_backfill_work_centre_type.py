from django.db import migrations

# The 2 values the old CharField(choices=) enum offered — now a starting
# point admins can extend/rename from Settings, not a closed list.
TYPE_NAMES = ["Machine", "Station"]

# Old CharField value -> new WorkCentreType.name, for backfilling existing rows.
OLD_VALUE_TO_NAME = {"MACHINE": "Machine", "STATION": "Station"}


def seed_and_backfill(apps, schema_editor):
    Organization = apps.get_model("core", "Organization")
    WorkCentreType = apps.get_model("work_centres", "WorkCentreType")
    WorkCentre = apps.get_model("work_centres", "WorkCentre")

    organization = Organization.objects.get(name="Default Organization")
    for name in TYPE_NAMES:
        WorkCentreType.objects.get_or_create(name=name, defaults={"organization": organization})

    for old_value, name in OLD_VALUE_TO_NAME.items():
        work_centre_type = WorkCentreType.objects.get(name=name)
        WorkCentre.objects.filter(type=old_value).update(type_fk=work_centre_type)


def reverse(apps, schema_editor):
    WorkCentreType = apps.get_model("work_centres", "WorkCentreType")
    WorkCentreType.objects.filter(name__in=TYPE_NAMES).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("work_centres", "0002_workcentretype_workcentre_type_fk"),
        ("core", "0002_seed_default_organization"),
    ]

    operations = [
        migrations.RunPython(seed_and_backfill, reverse),
    ]
