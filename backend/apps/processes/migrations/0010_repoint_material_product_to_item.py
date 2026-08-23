import django.db.models.deletion
from django.db import migrations, models


def backfill_item(apps, schema_editor):
    Material = apps.get_model("materials", "Material")
    Product = apps.get_model("products", "Product")
    Item = apps.get_model("items", "Item")
    ProcessInputDefinition = apps.get_model("processes", "ProcessInputDefinition")
    ProcessOutputDefinition = apps.get_model("processes", "ProcessOutputDefinition")

    material_code_by_id = dict(Material.objects.values_list("id", "code"))
    product_code_by_id = dict(Product.objects.values_list("id", "sku_code"))
    item_id_by_code = dict(Item.objects.values_list("code", "id"))

    for row in ProcessInputDefinition.objects.exclude(
        material_id=None, product_id=None
    ).iterator():
        code = (
            material_code_by_id.get(row.material_id)
            if row.material_id
            else product_code_by_id.get(row.product_id)
        )
        if code is None:
            continue
        row.item_id = item_id_by_code[code]
        row.save(update_fields=["item"])

    for row in ProcessOutputDefinition.objects.exclude(
        material_id=None, product_id=None
    ).iterator():
        code = (
            material_code_by_id.get(row.material_id)
            if row.material_id
            else product_code_by_id.get(row.product_id)
        )
        if code is None:
            continue
        row.item_id = item_id_by_code[code]
        row.save(update_fields=["item"])


def restore_material_product(apps, schema_editor):
    # No source data to restore from at this point (material_id/product_id
    # columns are dropped later in this same migration) — reversing past
    # this migration is not supported.
    raise RuntimeError(
        "Cannot reverse past 0010_repoint_material_product_to_item: the "
        "material/product columns it removes are not reconstructable from "
        "the item FK alone."
    )


class Migration(migrations.Migration):

    dependencies = [
        ("processes", "0009_rules_step_fields"),
        ("items", "0003_migrate_material_product_to_item"),
    ]

    operations = [
        migrations.AddField(
            model_name="processinputdefinition",
            name="item",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="+",
                to="items.item",
            ),
        ),
        migrations.AddField(
            model_name="processoutputdefinition",
            name="item",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="+",
                to="items.item",
            ),
        ),
        migrations.RunPython(backfill_item, restore_material_product),
        migrations.RemoveField(model_name="processinputdefinition", name="material"),
        migrations.RemoveField(model_name="processinputdefinition", name="product"),
        migrations.RemoveField(model_name="processoutputdefinition", name="material"),
        migrations.RemoveField(model_name="processoutputdefinition", name="product"),
    ]
