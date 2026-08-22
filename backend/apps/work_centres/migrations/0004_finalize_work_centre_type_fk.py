import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('work_centres', '0003_seed_and_backfill_work_centre_type'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='workcentre',
            name='type',
        ),
        migrations.RenameField(
            model_name='workcentre',
            old_name='type_fk',
            new_name='type',
        ),
        migrations.AlterField(
            model_name='workcentre',
            name='type',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name='work_centres',
                to='work_centres.workcentretype',
            ),
        ),
    ]
