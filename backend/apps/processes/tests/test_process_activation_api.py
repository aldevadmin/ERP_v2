import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework.test import APIClient

from apps.materials.models import Material
from apps.processes.models import (
    OutputClassification,
    ProcessCategory,
    ProcessDefinition,
    ProcessDefinitionVersion,
    ProcessOutputDefinition,
)
from apps.work_centres.models import WorkCentre, WorkCentreProcessCapability, WorkCentreType

pytestmark = pytest.mark.django_db

User = get_user_model()


def _client_as(role_name: str, username: str) -> APIClient:
    client = APIClient()
    user = User.objects.create_user(username=username, password="x")
    user.groups.add(Group.objects.get(name=role_name))
    client.force_authenticate(user=user)
    return client


def _version(organization, **overrides) -> ProcessDefinitionVersion:
    category = ProcessCategory.objects.create(
        name=overrides.pop("category_name", "Production"), organization=organization
    )
    definition = ProcessDefinition.objects.create(
        name=overrides.pop("name", "Pressing"),
        code=overrides.pop("code", "PRESS"),
        organization=organization,
    )
    return ProcessDefinitionVersion.objects.create(
        process_definition=definition,
        version_number=1,
        category=category,
        organization=organization,
        **overrides,
    )


def _scrap(organization) -> Material:
    return Material.objects.create(
        code="SCRAP", name="Wood Scrap", unit="Kg", organization=organization
    )


def _add_output(version: ProcessDefinitionVersion) -> None:
    classification, _ = OutputClassification.objects.get_or_create(
        name="Good", defaults={"organization": version.organization}
    )
    ProcessOutputDefinition.objects.create(
        process_version=version,
        sequence=1,
        item_type=ProcessOutputDefinition.ItemType.MATERIAL,
        material=_scrap(version.organization),
        uom="Kg",
        classification=classification,
        organization=version.organization,
    )


def test_activate_requires_authentication(organization):
    version = _version(organization)
    _add_output(version)
    client = APIClient()

    response = client.post(f"/api/v1/process-definition-versions/{version.id}/activate/")

    assert response.status_code == 403


def test_activate_succeeds_and_marks_active(organization):
    version = _version(organization)
    _add_output(version)
    client = _client_as("Manager/Admin", "mgr1")

    response = client.post(f"/api/v1/process-definition-versions/{version.id}/activate/")

    assert response.status_code == 200
    version.refresh_from_db()
    assert version.status == "ACTIVE"
    assert response.json()["status"] == "ACTIVE"


def test_activate_without_any_output_is_rejected(organization):
    version = _version(organization)
    client = _client_as("Manager/Admin", "mgr2")

    response = client.post(f"/api/v1/process-definition-versions/{version.id}/activate/")

    assert response.status_code == 400
    version.refresh_from_db()
    assert version.status == "DRAFT"


def test_activate_position_capture_without_work_centre_is_rejected(organization):
    version = _version(
        organization,
        work_centre_requirement=ProcessDefinitionVersion.WorkCentreRequirement.NONE,
        capture_mode=ProcessDefinitionVersion.CaptureMode.POSITION_LEVEL,
        position_label="Mould Position",
        default_position_count=6,
    )
    _add_output(version)
    client = _client_as("Manager/Admin", "mgr3")

    response = client.post(f"/api/v1/process-definition-versions/{version.id}/activate/")

    assert response.status_code == 400
    assert "work centre" in response.json()["detail"]


def test_activate_position_capture_with_work_centre_succeeds(organization):
    version = _version(
        organization,
        work_centre_requirement=ProcessDefinitionVersion.WorkCentreRequirement.MACHINE,
        capture_mode=ProcessDefinitionVersion.CaptureMode.POSITION_LEVEL,
        position_label="Mould Position",
        default_position_count=6,
    )
    _add_output(version)
    client = _client_as("Manager/Admin", "mgr4")

    response = client.post(f"/api/v1/process-definition-versions/{version.id}/activate/")

    assert response.status_code == 200


def test_activate_non_draft_version_is_rejected(organization):
    version = _version(organization, status=ProcessDefinitionVersion.Status.ACTIVE)
    _add_output(version)
    client = _client_as("Manager/Admin", "mgr5")

    response = client.post(f"/api/v1/process-definition-versions/{version.id}/activate/")

    assert response.status_code == 400


def test_activating_archives_the_previously_active_version(organization):
    category = ProcessCategory.objects.create(name="Production2", organization=organization)
    definition = ProcessDefinition.objects.create(
        name="Pressing2", code="PRESS2", organization=organization
    )
    old_active = ProcessDefinitionVersion.objects.create(
        process_definition=definition,
        version_number=1,
        status=ProcessDefinitionVersion.Status.ACTIVE,
        category=category,
        organization=organization,
    )
    new_draft = ProcessDefinitionVersion.objects.create(
        process_definition=definition,
        version_number=2,
        status=ProcessDefinitionVersion.Status.DRAFT,
        category=category,
        organization=organization,
    )
    _add_output(new_draft)
    client = _client_as("Manager/Admin", "mgr6")

    response = client.post(f"/api/v1/process-definition-versions/{new_draft.id}/activate/")

    assert response.status_code == 200
    old_active.refresh_from_db()
    new_draft.refresh_from_db()
    assert old_active.status == "ARCHIVED"
    assert new_draft.status == "ACTIVE"


def test_activate_warns_when_no_work_centre_capability_mapped(organization):
    version = _version(organization)
    _add_output(version)
    client = _client_as("Manager/Admin", "mgr7")

    response = client.post(f"/api/v1/process-definition-versions/{version.id}/activate/")

    assert response.status_code == 200
    assert response.json()["warnings"] == ["No work centre has been mapped to this process yet."]


def test_activate_has_no_warning_when_work_centre_capability_mapped(organization):
    version = _version(organization)
    _add_output(version)
    work_centre_type, _ = WorkCentreType.objects.get_or_create(
        name="Machine", defaults={"organization": organization}
    )
    work_centre = WorkCentre.objects.create(
        code="WC-1", name="Press 01", type=work_centre_type, organization=organization
    )
    WorkCentreProcessCapability.objects.create(
        work_centre=work_centre,
        process_definition=version.process_definition,
        organization=organization,
    )
    client = _client_as("Manager/Admin", "mgr8")

    response = client.post(f"/api/v1/process-definition-versions/{version.id}/activate/")

    assert response.status_code == 200
    assert response.json()["warnings"] == []
