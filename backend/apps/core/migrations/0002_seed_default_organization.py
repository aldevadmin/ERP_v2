from django.db import migrations

DEFAULT_ORGANIZATION_NAME = "Default Organization"


def seed_default_organization(apps, schema_editor):
    Organization = apps.get_model("core", "Organization")
    Organization.objects.get_or_create(name=DEFAULT_ORGANIZATION_NAME)


def remove_default_organization(apps, schema_editor):
    Organization = apps.get_model("core", "Organization")
    Organization.objects.filter(name=DEFAULT_ORGANIZATION_NAME).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(seed_default_organization, remove_default_organization),
    ]
