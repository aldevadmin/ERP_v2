from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("materials", "0002_material_category"),
        ("items", "0003_migrate_material_product_to_item"),
        # Must run after every migration that still reads Material via
        # apps.get_model("materials", "Material") — otherwise Django could
        # legally apply this DeleteModel before one of them on a fresh
        # database, since nothing else orders them relative to each other.
        ("processes", "0010_repoint_material_product_to_item"),
    ]

    operations = [
        migrations.DeleteModel(name="Material"),
    ]
