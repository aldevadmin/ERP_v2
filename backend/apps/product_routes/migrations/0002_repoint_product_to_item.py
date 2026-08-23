import django.db.models.deletion
from django.db import migrations, models


def backfill_item(apps, schema_editor):
    Product = apps.get_model("products", "Product")
    Item = apps.get_model("items", "Item")
    ProcessRoute = apps.get_model("product_routes", "ProcessRoute")

    product_code_by_id = dict(Product.objects.values_list("id", "sku_code"))
    item_id_by_code = dict(Item.objects.values_list("code", "id"))

    for row in ProcessRoute.objects.exclude(product_id=None).iterator():
        code = product_code_by_id.get(row.product_id)
        if code is None:
            continue
        row.item_id = item_id_by_code[code]
        row.save(update_fields=["item"])


def restore_product(apps, schema_editor):
    raise RuntimeError(
        "Cannot reverse past 0002_repoint_product_to_item: the product "
        "column it removes is not reconstructable from the item FK alone."
    )


class Migration(migrations.Migration):

    dependencies = [
        ("product_routes", "0001_initial"),
        ("items", "0003_migrate_material_product_to_item"),
    ]

    operations = [
        migrations.AddField(
            model_name="processroute",
            name="item",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="routes",
                to="items.item",
            ),
        ),
        migrations.RunPython(backfill_item, restore_product),
        migrations.RemoveField(model_name="processroute", name="product"),
        migrations.AlterField(
            model_name="processroute",
            name="item",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="routes",
                to="items.item",
            ),
        ),
    ]
