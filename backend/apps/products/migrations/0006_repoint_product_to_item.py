import django.db.models.deletion
from django.db import migrations, models


def backfill_item(apps, schema_editor):
    Product = apps.get_model("products", "Product")
    Item = apps.get_model("items", "Item")
    CustomerSKUMapping = apps.get_model("products", "CustomerSKUMapping")

    product_code_by_id = dict(Product.objects.values_list("id", "sku_code"))
    item_id_by_code = dict(Item.objects.values_list("code", "id"))

    for row in CustomerSKUMapping.objects.exclude(product_id=None).iterator():
        code = product_code_by_id.get(row.product_id)
        if code is None:
            continue
        row.item_id = item_id_by_code[code]
        row.save(update_fields=["item"])


def restore_product(apps, schema_editor):
    raise RuntimeError(
        "Cannot reverse past 0006_repoint_product_to_item: the product "
        "column it removes is not reconstructable from the item FK alone."
    )


class Migration(migrations.Migration):

    dependencies = [
        ("products", "0005_product_stage"),
        ("items", "0003_migrate_material_product_to_item"),
    ]

    operations = [
        migrations.AddField(
            model_name="customerskumapping",
            name="item",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="customer_mappings",
                to="items.item",
            ),
        ),
        migrations.RunPython(backfill_item, restore_product),
        migrations.RemoveField(model_name="customerskumapping", name="product"),
        migrations.AlterField(
            model_name="customerskumapping",
            name="item",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="customer_mappings",
                to="items.item",
            ),
        ),
    ]
