from django.db import migrations, models


def backfill_customer_sku(apps, schema_editor):
    CustomerProductMapping = apps.get_model("customer_mappings", "CustomerProductMapping")
    for mapping in CustomerProductMapping.objects.all():
        version = (
            mapping.versions.filter(status="PUBLISHED").order_by("-version_number").first()
            or mapping.versions.order_by("-version_number").first()
        )
        mapping.customer_sku = version.customer_sku if version else f"SKU-{mapping.id}"
        mapping.save(update_fields=["customer_sku"])


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("customer_mappings", "0003_migrate_customer_sku_mappings"),
    ]

    operations = [
        migrations.AddField(
            model_name="customerproductmapping",
            name="customer_sku",
            field=models.CharField(default="", max_length=64),
            preserve_default=False,
        ),
        migrations.RunPython(backfill_customer_sku, noop_reverse),
        migrations.RemoveConstraint(
            model_name="customerproductmapping",
            name="one_mapping_per_customer_item",
        ),
        migrations.AddConstraint(
            model_name="customerproductmapping",
            constraint=models.UniqueConstraint(
                fields=("customer", "customer_sku"), name="one_mapping_per_customer_sku"
            ),
        ),
        migrations.RemoveField(
            model_name="customerproductmappingversion",
            name="customer_sku",
        ),
    ]
