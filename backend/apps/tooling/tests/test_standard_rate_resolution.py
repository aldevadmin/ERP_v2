from decimal import Decimal

import pytest
from django.utils import timezone

from apps.processes.models import ProcessCategory, ProcessDefinition, ProcessDefinitionVersion
from apps.tooling.models import Tooling, ToolingAssignment, ToolingType, WorkCentrePosition
from apps.tooling.services import resolve_standard_rate
from apps.work_centres.models import WorkCentre, WorkCentreProcessCapability, WorkCentreType

pytestmark = pytest.mark.django_db


def _process(organization, code: str = "PRESS") -> ProcessDefinition:
    category, _ = ProcessCategory.objects.get_or_create(
        name="Production", defaults={"organization": organization}
    )
    definition = ProcessDefinition.objects.create(
        name="Pressing", code=code, organization=organization
    )
    ProcessDefinitionVersion.objects.create(
        process_definition=definition,
        version_number=1,
        status=ProcessDefinitionVersion.Status.ACTIVE,
        category=category,
        organization=organization,
    )
    return definition


def _work_centre(organization) -> WorkCentre:
    work_centre_type, _ = WorkCentreType.objects.get_or_create(
        name="Machine", defaults={"organization": organization}
    )
    return WorkCentre.objects.create(
        code="WC-1", name="Press 01", type=work_centre_type, organization=organization
    )


def _position(organization, work_centre: WorkCentre) -> WorkCentrePosition:
    return WorkCentrePosition.objects.create(
        work_centre=work_centre, position_index=1, organization=organization
    )


def _tooling(organization, default_standard_rate=None) -> Tooling:
    tooling_type, _ = ToolingType.objects.get_or_create(
        name="Mould", defaults={"organization": organization}
    )
    return Tooling.objects.create(
        code="MLD-101",
        name="Mould",
        tooling_type=tooling_type,
        default_standard_rate=default_standard_rate,
        organization=organization,
    )


def test_resolves_from_assignment_override_first(organization):
    process = _process(organization)
    work_centre = _work_centre(organization)
    position = _position(organization, work_centre)
    WorkCentreProcessCapability.objects.create(
        work_centre=work_centre,
        process_definition=process,
        standard_rate=40,
        organization=organization,
    )
    tooling = _tooling(organization, default_standard_rate=50)
    ToolingAssignment.objects.create(
        tooling=tooling,
        work_centre_position=position,
        standard_rate_override=70,
        effective_from=timezone.now(),
        organization=organization,
    )

    rate = resolve_standard_rate(position, process)

    assert rate == Decimal("70")


def test_falls_back_to_tooling_default_rate(organization):
    process = _process(organization)
    work_centre = _work_centre(organization)
    position = _position(organization, work_centre)
    WorkCentreProcessCapability.objects.create(
        work_centre=work_centre,
        process_definition=process,
        standard_rate=40,
        organization=organization,
    )
    tooling = _tooling(organization, default_standard_rate=50)
    ToolingAssignment.objects.create(
        tooling=tooling,
        work_centre_position=position,
        standard_rate_override=None,
        effective_from=timezone.now(),
        organization=organization,
    )

    rate = resolve_standard_rate(position, process)

    assert rate == Decimal("50")


def test_falls_back_to_work_centre_capability_rate(organization):
    process = _process(organization)
    work_centre = _work_centre(organization)
    position = _position(organization, work_centre)
    WorkCentreProcessCapability.objects.create(
        work_centre=work_centre,
        process_definition=process,
        standard_rate=40,
        organization=organization,
    )

    rate = resolve_standard_rate(position, process)

    assert rate == Decimal("40")


def test_returns_none_when_nothing_resolves(organization):
    process = _process(organization)
    work_centre = _work_centre(organization)
    position = _position(organization, work_centre)

    rate = resolve_standard_rate(position, process)

    assert rate is None


def test_closed_assignment_is_not_used(organization):
    process = _process(organization)
    work_centre = _work_centre(organization)
    position = _position(organization, work_centre)
    WorkCentreProcessCapability.objects.create(
        work_centre=work_centre,
        process_definition=process,
        standard_rate=40,
        organization=organization,
    )
    tooling = _tooling(organization, default_standard_rate=50)
    now = timezone.now()
    ToolingAssignment.objects.create(
        tooling=tooling,
        work_centre_position=position,
        standard_rate_override=70,
        effective_from=now - timezone.timedelta(days=1),
        effective_to=now,
        organization=organization,
    )

    rate = resolve_standard_rate(position, process)

    assert rate == Decimal("40")
