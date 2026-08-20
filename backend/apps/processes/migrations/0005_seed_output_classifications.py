from django.db import migrations

# Spec-mandated seed set for the Step 3 (Outputs) Classification field —
# a configurable master, not a hard-coded enum, so these are a starting
# point admins can extend/rename from Settings, not a closed list.
CLASSIFICATION_NAMES = ["Premium", "Standard", "Good", "Reject", "Scrap", "Other"]


def seed_classifications(apps, schema_editor):
    Organization = apps.get_model("core", "Organization")
    OutputClassification = apps.get_model("processes", "OutputClassification")

    organization = Organization.objects.get(name="Default Organization")
    for name in CLASSIFICATION_NAMES:
        OutputClassification.objects.get_or_create(name=name, defaults={"organization": organization})


def remove_classifications(apps, schema_editor):
    OutputClassification = apps.get_model("processes", "OutputClassification")
    OutputClassification.objects.filter(name__in=CLASSIFICATION_NAMES).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("processes", "0004_outputclassification_processoutputdefinition"),
        ("core", "0002_seed_default_organization"),
    ]

    operations = [
        migrations.RunPython(seed_classifications, remove_classifications),
    ]
