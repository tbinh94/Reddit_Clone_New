# Generated by Django 5.2.3 on 2025-07-21 13:56

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('posts', '0026_remove_post_language'),
    ]

    operations = [
        migrations.AddField(
            model_name='comment',
            name='is_bot',
            field=models.BooleanField(default=False),
        ),
    ]
