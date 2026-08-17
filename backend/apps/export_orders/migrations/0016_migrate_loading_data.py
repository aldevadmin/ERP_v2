from django.db import migrations


def forwards(apps, schema_editor):
    """One starting `LoadingTransaction` per `ShipmentLine` that already has
    a loaded quantity — preserves existing data as the ledger's first entry
    rather than discarding it. Best-effort `date` (no original per-load
    date was ever recorded under the old single-field design) from
    `updated_at`.
    """
    ShipmentLine = apps.get_model("export_orders", "ShipmentLine")
    LoadingTransaction = apps.get_model("export_orders", "LoadingTransaction")

    for line in ShipmentLine.objects.exclude(actual_loaded_cartons__isnull=True):
        LoadingTransaction.objects.create(
            shipment_line=line,
            date=line.updated_at.date(),
            entry_type="CARTON_LOADED",
            cartons_loaded=line.actual_loaded_cartons,
            variance_reason=line.variance_reason,
            remarks="",
            created_by=line.updated_by,
            updated_by=line.updated_by,
        )


def backwards(apps, schema_editor):
    """No-op — `ShipmentLine.actual_loaded_cartons`/`variance_reason` are
    removed by the next migration regardless, so there is nothing to
    restore data into on a reverse migration.
    """


class Migration(migrations.Migration):

    dependencies = [
        ("export_orders", "0015_loadingtransaction"),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
