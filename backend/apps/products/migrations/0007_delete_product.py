from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("products", "0006_repoint_product_to_item"),
        ("items", "0003_migrate_material_product_to_item"),
        # Must run after every migration that still reads Product via
        # apps.get_model("products", "Product") — otherwise Django could
        # legally apply this DeleteModel before one of them on a fresh
        # database, since nothing else orders them relative to each other.
        ("processes", "0010_repoint_material_product_to_item"),
        ("tooling", "0006_repoint_product_to_item"),
        ("product_routes", "0002_repoint_product_to_item"),
        ("export_orders", "0018_repoint_product_to_item"),
    ]

    operations = [
        migrations.DeleteModel(name="Product"),
    ]
