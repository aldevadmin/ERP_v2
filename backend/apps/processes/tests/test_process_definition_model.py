import pytest
from django.db import IntegrityError, transaction

from apps.processes.models import ProcessCategory, ProcessDefinition, ProcessDefinitionVersion

pytestmark = pytest.mark.django_db


def _category(organization, name: str = "Production") -> ProcessCategory:
    return ProcessCategory.objects.create(name=name, organization=organization)


def test_code_must_be_unique(organization):
    ProcessDefinition.objects.create(name="Pressing", code="PRESS", organization=organization)

    with pytest.raises(IntegrityError), transaction.atomic():
        ProcessDefinition.objects.create(name="Duplicate", code="PRESS", organization=organization)


def test_str_is_name(organization):
    definition = ProcessDefinition.objects.create(
        name="Pressing", code="PRESS", organization=organization
    )

    assert str(definition) == "Pressing"


def test_current_version_prefers_active_over_draft(organization):
    category = _category(organization)
    definition = ProcessDefinition.objects.create(
        name="Pressing", code="PRESS", organization=organization
    )
    ProcessDefinitionVersion.objects.create(
        process_definition=definition,
        version_number=1,
        status=ProcessDefinitionVersion.Status.ARCHIVED,
        category=category,
        organization=organization,
    )
    active = ProcessDefinitionVersion.objects.create(
        process_definition=definition,
        version_number=2,
        status=ProcessDefinitionVersion.Status.ACTIVE,
        category=category,
        organization=organization,
    )
    ProcessDefinitionVersion.objects.create(
        process_definition=definition,
        version_number=3,
        status=ProcessDefinitionVersion.Status.DRAFT,
        category=category,
        organization=organization,
    )

    assert definition.current_version() == active


def test_current_version_falls_back_to_latest_when_no_active(organization):
    category = _category(organization)
    definition = ProcessDefinition.objects.create(
        name="Pressing", code="PRESS", organization=organization
    )
    ProcessDefinitionVersion.objects.create(
        process_definition=definition,
        version_number=1,
        category=category,
        organization=organization,
    )
    latest = ProcessDefinitionVersion.objects.create(
        process_definition=definition,
        version_number=2,
        category=category,
        organization=organization,
    )

    assert definition.current_version() == latest


def test_current_version_none_when_no_versions(organization):
    definition = ProcessDefinition.objects.create(
        name="Pressing", code="PRESS", organization=organization
    )

    assert definition.current_version() is None


def test_version_number_unique_per_definition(organization):
    category = _category(organization)
    definition = ProcessDefinition.objects.create(
        name="Pressing", code="PRESS", organization=organization
    )
    ProcessDefinitionVersion.objects.create(
        process_definition=definition,
        version_number=1,
        category=category,
        organization=organization,
    )

    with pytest.raises(IntegrityError), transaction.atomic():
        ProcessDefinitionVersion.objects.create(
            process_definition=definition,
            version_number=1,
            category=category,
            organization=organization,
        )
