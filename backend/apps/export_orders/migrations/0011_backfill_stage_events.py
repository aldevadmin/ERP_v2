from django.db import migrations


def backfill_stage_events(apps, schema_editor):
    """Existing orders predate ExportOrderStageEvent, so they have no
    history at all. We only know their *current* status, not when earlier
    stages happened — seeding one event for the current status (dated at
    the order's own creation) is the least-wrong guess; the serializer
    treats stages with no matching event as "completed, date unknown"
    rather than inventing timestamps for stages we have no record of.
    """
    ExportOrder = apps.get_model("export_orders", "ExportOrder")
    ExportOrderStageEvent = apps.get_model("export_orders", "ExportOrderStageEvent")

    for order in ExportOrder.objects.all():
        if not ExportOrderStageEvent.objects.filter(export_order=order).exists():
            ExportOrderStageEvent.objects.create(
                export_order=order,
                status=order.status,
                created_by=order.created_by,
            )


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("export_orders", "0010_alter_exportorder_status_exportordernote_and_more"),
    ]

    operations = [
        migrations.RunPython(backfill_stage_events, noop_reverse),
    ]
