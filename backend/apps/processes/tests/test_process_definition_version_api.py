import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework.test import APIClient

from apps.processes.models import ProcessCategory, ProcessDefinition, ProcessDefinitionVersion

pytestmark = pytest.mark.django_db

User = get_user_model()


def _client_as(role_name: str, username: str) -> APIClient:
    client = APIClient()
    user = User.objects.create_user(username=username, password="x")
    user.groups.add(Group.objects.get(name=role_name))
    client.force_authenticate(user=user)
    return client


def _version(
    organization, status=ProcessDefinitionVersion.Status.DRAFT
) -> ProcessDefinitionVersion:
    category = ProcessCategory.objects.create(name="Production", organization=organization)
    definition = ProcessDefinition.objects.create(
        name="Pressing", code="PRESS", organization=organization
    )
    return ProcessDefinitionVersion.objects.create(
        process_definition=definition,
        version_number=1,
        status=status,
        category=category,
        organization=organization,
    )


def test_retrieve_requires_authentication(organization):
    version = _version(organization)
    client = APIClient()

    response = client.get(f"/api/v1/process-definition-versions/{version.id}/")

    assert response.status_code == 403


def test_retrieve_returns_version_detail(organization):
    version = _version(organization)
    client = _client_as("Export Coordinator", "coord1")

    response = client.get(f"/api/v1/process-definition-versions/{version.id}/")

    assert response.status_code == 200
    body = response.json()
    assert body["version_number"] == 1
    assert body["status"] == "DRAFT"
    assert body["category_name"] == "Production"


def test_update_draft_version_succeeds(organization):
    version = _version(organization)
    client = _client_as("Manager/Admin", "mgr1")

    response = client.patch(
        f"/api/v1/process-definition-versions/{version.id}/",
        {"description": "Presses leaf into a plate."},
        format="json",
    )

    assert response.status_code == 200
    version.refresh_from_db()
    assert version.description == "Presses leaf into a plate."


def test_update_work_centre_fields(organization):
    version = _version(organization)
    client = _client_as("Manager/Admin", "mgr4")

    response = client.patch(
        f"/api/v1/process-definition-versions/{version.id}/",
        {
            "work_centre_requirement": "MACHINE",
            "operator_required": True,
            "standard_rate_config_level": "WORK_CENTRE",
        },
        format="json",
    )

    assert response.status_code == 200
    version.refresh_from_db()
    assert version.work_centre_requirement == "MACHINE"
    assert version.operator_required is True
    assert version.standard_rate_config_level == "WORK_CENTRE"


def test_update_performance_flags(organization):
    version = _version(organization)
    client = _client_as("Manager/Admin", "mgr11")

    response = client.patch(
        f"/api/v1/process-definition-versions/{version.id}/",
        {"allow_manual_standard_rate": False, "reserve_machine_derived_rate": False},
        format="json",
    )

    assert response.status_code == 200
    version.refresh_from_db()
    assert version.allow_manual_standard_rate is False
    assert version.reserve_machine_derived_rate is False


def test_update_rules_fields(organization):
    version = _version(organization)
    client = _client_as("Manager/Admin", "mgr12")

    response = client.patch(
        f"/api/v1/process-definition-versions/{version.id}/",
        {
            "transaction_frequency": "SHIFT",
            "batch_lot_mode": "REQUIRED",
            "partial_output_forward": False,
            "input_consumption_mode": "FORMULA",
            "completion_mode": "TARGET_REACHED",
            "qc_requirement": "REQUIRED",
            "allow_correction_with_audit_trail": False,
            "allow_destructive_delete": True,
            "permit_machine_generated_source": False,
        },
        format="json",
    )

    assert response.status_code == 200
    version.refresh_from_db()
    assert version.transaction_frequency == "SHIFT"
    assert version.batch_lot_mode == "REQUIRED"
    assert version.partial_output_forward is False
    assert version.input_consumption_mode == "FORMULA"
    assert version.completion_mode == "TARGET_REACHED"
    assert version.qc_requirement == "REQUIRED"
    assert version.allow_correction_with_audit_trail is False
    assert version.allow_destructive_delete is True
    assert version.permit_machine_generated_source is False


def test_over_production_without_tolerance_is_rejected(organization):
    version = _version(organization)
    client = _client_as("Manager/Admin", "mgr13")

    response = client.patch(
        f"/api/v1/process-definition-versions/{version.id}/",
        {"allow_over_production": True},
        format="json",
    )

    assert response.status_code == 400
    version.refresh_from_db()
    assert version.allow_over_production is False


def test_over_production_with_tolerance_succeeds(organization):
    version = _version(organization)
    client = _client_as("Manager/Admin", "mgr14")

    response = client.patch(
        f"/api/v1/process-definition-versions/{version.id}/",
        {"allow_over_production": True, "over_production_tolerance_percent": 5},
        format="json",
    )

    assert response.status_code == 200
    version.refresh_from_db()
    assert version.allow_over_production is True
    assert version.over_production_tolerance_percent == 5


def test_disabling_over_production_does_not_require_tolerance(organization):
    version = _version(organization)
    version.allow_over_production = True
    version.over_production_tolerance_percent = 5
    version.save()
    client = _client_as("Manager/Admin", "mgr15")

    response = client.patch(
        f"/api/v1/process-definition-versions/{version.id}/",
        {"allow_over_production": False},
        format="json",
    )

    assert response.status_code == 200
    version.refresh_from_db()
    assert version.allow_over_production is False


def test_update_output_capture_fields_work_centre_total(organization):
    version = _version(organization)
    client = _client_as("Manager/Admin", "mgr5")

    response = client.patch(
        f"/api/v1/process-definition-versions/{version.id}/",
        {"capture_mode": "WORK_CENTRE_TOTAL"},
        format="json",
    )

    assert response.status_code == 200
    version.refresh_from_db()
    assert version.capture_mode == "WORK_CENTRE_TOTAL"


def test_update_output_capture_fields_position_level(organization):
    version = _version(organization)
    client = _client_as("Manager/Admin", "mgr6")

    response = client.patch(
        f"/api/v1/process-definition-versions/{version.id}/",
        {
            "capture_mode": "POSITION_LEVEL",
            "position_label": "Mould Position",
            "default_position_count": 6,
            "allow_work_centre_override": True,
            "allow_different_sku_per_position": True,
        },
        format="json",
    )

    assert response.status_code == 200
    version.refresh_from_db()
    assert version.capture_mode == "POSITION_LEVEL"
    assert version.position_label == "Mould Position"
    assert version.default_position_count == 6
    assert version.allow_work_centre_override is True
    assert version.allow_different_sku_per_position is True


def test_position_level_without_label_is_rejected(organization):
    version = _version(organization)
    client = _client_as("Manager/Admin", "mgr7")

    response = client.patch(
        f"/api/v1/process-definition-versions/{version.id}/",
        {"capture_mode": "POSITION_LEVEL", "default_position_count": 6},
        format="json",
    )

    assert response.status_code == 400
    version.refresh_from_db()
    assert version.capture_mode == ""


def test_position_level_without_count_is_rejected(organization):
    version = _version(organization)
    client = _client_as("Manager/Admin", "mgr8")

    response = client.patch(
        f"/api/v1/process-definition-versions/{version.id}/",
        {"capture_mode": "BOTH", "position_label": "Mould Position"},
        format="json",
    )

    assert response.status_code == 400


def test_position_level_rejects_zero_count(organization):
    version = _version(organization)
    client = _client_as("Manager/Admin", "mgr9")

    response = client.patch(
        f"/api/v1/process-definition-versions/{version.id}/",
        {
            "capture_mode": "POSITION_LEVEL",
            "position_label": "Mould Position",
            "default_position_count": 0,
        },
        format="json",
    )

    assert response.status_code == 400


def test_switching_back_to_work_centre_total_does_not_require_position_fields(organization):
    category = ProcessCategory.objects.create(name="Production2", organization=organization)
    version = ProcessDefinitionVersion.objects.create(
        process_definition=ProcessDefinition.objects.create(
            name="Pressing2", code="PRESS2", organization=organization
        ),
        version_number=1,
        category=category,
        capture_mode=ProcessDefinitionVersion.CaptureMode.POSITION_LEVEL,
        position_label="Mould Position",
        default_position_count=6,
        organization=organization,
    )
    client = _client_as("Manager/Admin", "mgr10")

    response = client.patch(
        f"/api/v1/process-definition-versions/{version.id}/",
        {"capture_mode": "WORK_CENTRE_TOTAL"},
        format="json",
    )

    assert response.status_code == 200


def test_update_active_version_is_rejected(organization):
    version = _version(organization, status=ProcessDefinitionVersion.Status.ACTIVE)
    client = _client_as("Manager/Admin", "mgr2")

    response = client.patch(
        f"/api/v1/process-definition-versions/{version.id}/",
        {"description": "Trying to edit"},
        format="json",
    )

    assert response.status_code == 400
    version.refresh_from_db()
    assert version.description == ""


def test_update_archived_version_is_rejected(organization):
    version = _version(organization, status=ProcessDefinitionVersion.Status.ARCHIVED)
    client = _client_as("Manager/Admin", "mgr3")

    response = client.patch(
        f"/api/v1/process-definition-versions/{version.id}/",
        {"description": "Trying to edit"},
        format="json",
    )

    assert response.status_code == 400
