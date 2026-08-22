import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('tooling', '0003_seed_and_backfill_tooling_type'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='tooling',
            name='tooling_type',
        ),
        migrations.RenameField(
            model_name='tooling',
            old_name='tooling_type_fk',
            new_name='tooling_type',
        ),
        migrations.AlterField(
            model_name='tooling',
            name='tooling_type',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name='tooling',
                to='tooling.toolingtype',
            ),
        ),
    ]
