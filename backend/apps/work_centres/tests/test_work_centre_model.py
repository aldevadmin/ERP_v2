import pytest
from django.db import IntegrityError, transaction

from apps.processes.models import ProcessCategory, ProcessDefinition, ProcessDefinitionVersion
from apps.work_centres.models import WorkCentre, WorkCentreProcessCapability, WorkCentreType

pytestmark = pytest.mark.django_db


def _work_centre_type(organization, name: str = "Machine") -> WorkCentreType:
    work_centre_type, _ = WorkCentreType.objects.get_or_create(
        name=name, defaults={"organization": organization}
    )
    return work_centre_type


def test_code_must_be_unique(organization):
    WorkCentre.objects.create(
        code="WC-1",
        name="Press 01",
        type=_work_centre_type(organization),
        organization=organization,
    )

    with pytest.raises(IntegrityError), transaction.atomic():
        WorkCentre.objects.create(
            code="WC-1",
            name="Duplicate",
            type=_work_centre_type(organization),
            organization=organization,
        )


def test_str_includes_code(organization):
    work_centre = WorkCentre.objects.create(
        code="WC-2",
        name="Press 01",
        type=_work_centre_type(organization),
        organization=organization,
    )

    assert str(work_centre) == "Press 01 (WC-2)"


def test_capability_unique_per_work_centre_and_process(organization):
    work_centre = WorkCentre.objects.create(
        code="WC-3",
        name="Press 02",
        type=_work_centre_type(organization),
        organization=organization,
    )
    category = ProcessCategory.objects.create(name="Production", organization=organization)
    definition = ProcessDefinition.objects.create(
        name="Pressing", code="PRESS", organization=organization
    )
    ProcessDefinitionVersion.objects.create(
        process_definition=definition,
        version_number=1,
        category=category,
        organization=organization,
    )
    WorkCentreProcessCapability.objects.create(
        work_centre=work_centre, process_definition=definition, organization=organization
    )

    with pytest.raises(IntegrityError), transaction.atomic():
        WorkCentreProcessCapability.objects.create(
            work_centre=work_centre, process_definition=definition, organization=organization
        )
