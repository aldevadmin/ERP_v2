from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('products', '0007_delete_product'),
        # Must run after the data migration that copies CustomerSKUMapping
        # rows into the new customer_mappings schema — otherwise this
        # drops the source data before it's been carried over.
        ('customer_mappings', '0003_migrate_customer_sku_mappings'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='customerskumappingfile',
            name='customer_sku_mapping',
        ),
        migrations.RemoveField(
            model_name='customerskumappingfile',
            name='created_by',
        ),
        migrations.RemoveField(
            model_name='customerskumappingfile',
            name='updated_by',
        ),
        migrations.DeleteModel(
            name='CustomerSKUMapping',
        ),
        migrations.DeleteModel(
            name='CustomerSKUMappingFile',
        ),
    ]
