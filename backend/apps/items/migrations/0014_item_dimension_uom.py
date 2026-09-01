from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('items', '0013_seed_item_field_rules'),
    ]

    operations = [
        migrations.RenameField(
            model_name='item',
            old_name='breadth_in',
            new_name='breadth',
        ),
        migrations.RenameField(
            model_name='item',
            old_name='height_mm',
            new_name='height',
        ),
        migrations.RenameField(
            model_name='item',
            old_name='length_in',
            new_name='length',
        ),
        migrations.AddField(
            model_name='item',
            name='length_uom',
            field=models.CharField(blank=True, choices=[('IN', 'Inches'), ('MM', 'Millimeters')], max_length=2, null=True),
        ),
        migrations.AddField(
            model_name='item',
            name='breadth_uom',
            field=models.CharField(blank=True, choices=[('IN', 'Inches'), ('MM', 'Millimeters')], max_length=2, null=True),
        ),
        migrations.AddField(
            model_name='item',
            name='height_uom',
            field=models.CharField(blank=True, choices=[('IN', 'Inches'), ('MM', 'Millimeters')], max_length=2, null=True),
        ),
    ]
