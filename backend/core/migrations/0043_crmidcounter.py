import re

from django.db import migrations, models


def initialize_crm_id_counter(apps, schema_editor):
    Student = apps.get_model("core", "Student")
    CRMIDCounter = apps.get_model("core", "CRMIDCounter")

    db_alias = schema_editor.connection.alias

    max_num = 0

    existing_ids = (
        Student.objects.using(db_alias)
        .values_list("crm_student_id", flat=True)
        .iterator()
    )

    for crm_id in existing_ids:
        if not crm_id:
            continue

        match = re.search(r"NATYA-(\d+)", crm_id)

        if match:
            number = int(match.group(1))
            max_num = max(max_num, number)

    CRMIDCounter.objects.using(db_alias).update_or_create(
        name="student",
        defaults={"value": max_num},
    )


class Migration(migrations.Migration):

    dependencies = [
        (
            "core",
            "0042_merge_0041_program_is_active_0041_student_cre_update",
        ),
    ]

    operations = [
        migrations.CreateModel(
            name="CRMIDCounter",
            fields=[
                (
                    "name",
                    models.CharField(
                        max_length=50,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                (
                    "value",
                    models.PositiveBigIntegerField(default=0),
                ),
            ],
            options={
                "db_table": "core_crmid_counter",
            },
        ),
        migrations.RunPython(
            initialize_crm_id_counter,
            migrations.RunPython.noop,
        ),
    ]