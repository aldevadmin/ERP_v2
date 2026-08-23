import django.db.models.deletion
from django.db import migrations, models


def backfill_item(apps, schema_editor):
    Product = apps.get_model("products", "Product")
    Item = apps.get_model("items", "Item")
    ExportOrderLine = apps.get_model("export_orders", "ExportOrderLine")

    product_code_by_id = dict(Product.objects.values_list("id", "sku_code"))
    item_id_by_code = dict(Item.objects.values_list("code", "id"))

    for row in ExportOrderLine.objects.exclude(product_id=None).iterator():
        code = product_code_by_id.get(row.product_id)
        if code is None:
            continue
        row.item_id = item_id_by_code[code]
        row.save(update_fields=["item"])


def restore_product(apps, schema_editor):
    raise RuntimeError(
        "Cannot reverse past 0018_repoint_product_to_item: the product "
        "column it removes is not reconstructable from the item FK alone."
    )


class Migration(migrations.Migration):

    dependencies = [
        ("export_orders", "0017_remove_shipmentline_loading_fields"),
        ("items", "0003_migrate_material_product_to_item"),
    ]

    operations = [
        migrations.AddField(
            model_name="exportorderline",
            name="item",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="export_order_lines",
                to="items.item",
            ),
        ),
        migrations.RunPython(backfill_item, restore_product),
        migrations.RemoveField(model_name="exportorderline", name="product"),
    ]
