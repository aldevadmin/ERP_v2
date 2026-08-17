from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('export_orders', '0016_migrate_loading_data'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='shipmentline',
            name='actual_loaded_cartons',
        ),
        migrations.RemoveField(
            model_name='shipmentline',
            name='variance_reason',
        ),
    ]
