import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework.test import APIClient

from apps.processes.models import (
    ProcessCategory,
    ProcessDefinition,
    ProcessDefinitionVersion,
    ProcessParameterDefinition,
)

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


def test_add_a_number_parameter(organization):
    version = _version(organization)
    client = _client_as("Export Coordinator", "coord1")

    response = client.patch(
        f"/api/v1/process-definition-versions/{version.id}/parameters/",
        {
            "parameters": [
                {
                    "label": "Temperature",
                    "code": "TEMPERATURE",
                    "data_type": "NUMBER",
                    "unit": "°C",
                    "capture_at": "START",
                    "is_required": True,
                }
            ]
        },
        format="json",
    )

    assert response.status_code == 200
    row = version.parameters.get()
    assert row.label == "Temperature"
    assert row.code == "TEMPERATURE"
    assert row.data_type == "NUMBER"
    assert row.unit == "°C"
    assert row.capture_at == "START"
    assert row.sequence == 1


def test_add_a_parameter_response_reflects_the_new_row(organization):
    # Regression test — see the matching test in
    # test_process_input_definition_api.py: the response used to be built
    # from a prefetch cache taken before this action's writes, so a freshly
    # added row was saved but silently missing from the PATCH response.
    version = _version(organization)
    client = _client_as("Export Coordinator", "coord1b")

    response = client.patch(
        f"/api/v1/process-definition-versions/{version.id}/parameters/",
        {
            "parameters": [
                {
                    "label": "Temperature",
                    "code": "TEMPERATURE",
                    "data_type": "NUMBER",
                    "capture_at": "START",
                }
            ]
        },
        format="json",
    )

    assert response.status_code == 200
    body_parameters = response.json()["parameters"]
    assert len(body_parameters) == 1
    assert body_parameters[0]["label"] == "Temperature"


def test_add_parameters_of_every_data_type(organization):
    version = _version(organization)
    client = _client_as("Export Coordinator", "coord2")

    response = client.patch(
        f"/api/v1/process-definition-versions/{version.id}/parameters/",
        {
            "parameters": [
                {"label": "Temp", "code": "TEMP", "data_type": "NUMBER", "capture_at": "START"},
                {"label": "Notes", "code": "NOTES", "data_type": "TEXT", "capture_at": "DURING"},
                {
                    "label": "Passed QC",
                    "code": "PASSED_QC",
                    "data_type": "BOOLEAN",
                    "capture_at": "COMPLETION",
                },
                {
                    "label": "Grade",
                    "code": "GRADE",
                    "data_type": "SELECT",
                    "capture_at": "COMPLETION",
                    "default_value": "A,B,C",
                },
                {
                    "label": "Mould Setup",
                    "code": "MOULD_SETUP",
                    "data_type": "REFERENCE",
                    "capture_at": "SETUP",
                },
                {
                    "label": "Batch Date",
                    "code": "BATCH_DATE",
                    "data_type": "DATE",
                    "capture_at": "START",
                },
                {
                    "label": "Logged At",
                    "code": "LOGGED_AT",
                    "data_type": "DATETIME",
                    "capture_at": "START",
                },
            ]
        },
        format="json",
    )

    assert response.status_code == 200
    assert version.parameters.count() == 7
    grade = version.parameters.get(code="GRADE")
    assert grade.default_value == "A,B,C"


def test_code_is_required(organization):
    version = _version(organization)
    client = _client_as("Export Coordinator", "coord3")

    response = client.patch(
        f"/api/v1/process-definition-versions/{version.id}/parameters/",
        {"parameters": [{"label": "Temperature", "data_type": "NUMBER", "capture_at": "START"}]},
        format="json",
    )

    assert response.status_code == 400


def test_rejects_duplicate_codes_within_the_same_payload(organization):
    version = _version(organization)
    client = _client_as("Export Coordinator", "coord4")

    response = client.patch(
        f"/api/v1/process-definition-versions/{version.id}/parameters/",
        {
            "parameters": [
                {
                    "label": "Temperature",
                    "code": "TEMP",
                    "data_type": "NUMBER",
                    "capture_at": "START",
                },
                {
                    "label": "Temp Again",
                    "code": "TEMP",
                    "data_type": "NUMBER",
                    "capture_at": "START",
                },
            ]
        },
        format="json",
    )

    assert response.status_code == 400
    assert version.parameters.count() == 0


def test_whole_list_replace_updates_creates_and_deletes(organization):
    version = _version(organization)
    existing = ProcessParameterDefinition.objects.create(
        process_version=version,
        sequence=1,
        label="Temperature",
        code="TEMPERATURE",
        data_type=ProcessParameterDefinition.DataType.NUMBER,
        capture_at=ProcessParameterDefinition.CaptureAt.START,
        organization=organization,
    )
    stale = ProcessParameterDefinition.objects.create(
        process_version=version,
        sequence=2,
        label="Pressure",
        code="PRESSURE",
        data_type=ProcessParameterDefinition.DataType.NUMBER,
        capture_at=ProcessParameterDefinition.CaptureAt.START,
        organization=organization,
    )
    client = _client_as("Export Coordinator", "coord5")

    response = client.patch(
        f"/api/v1/process-definition-versions/{version.id}/parameters/",
        {
            "parameters": [
                {
                    "id": existing.id,
                    "label": "Temperature",
                    "code": "TEMPERATURE",
                    "data_type": "NUMBER",
                    "capture_at": "START",
                    "is_required": False,
                }
            ]
        },
        format="json",
    )

    assert response.status_code == 200
    assert not ProcessParameterDefinition.objects.filter(id=stale.id).exists()
    row = version.parameters.get()
    assert row.id == existing.id
    assert row.is_required is False


def test_reorder_via_resend_reassigns_sequence(organization):
    version = _version(organization)
    first = ProcessParameterDefinition.objects.create(
        process_version=version,
        sequence=1,
        label="Temperature",
        code="TEMPERATURE",
        data_type=ProcessParameterDefinition.DataType.NUMBER,
        capture_at=ProcessParameterDefinition.CaptureAt.START,
        organization=organization,
    )
    second = ProcessParameterDefinition.objects.create(
        process_version=version,
        sequence=2,
        label="Pressure",
        code="PRESSURE",
        data_type=ProcessParameterDefinition.DataType.NUMBER,
        capture_at=ProcessParameterDefinition.CaptureAt.START,
        organization=organization,
    )
    client = _client_as("Export Coordinator", "coord6")

    response = client.patch(
        f"/api/v1/process-definition-versions/{version.id}/parameters/",
        {
            "parameters": [
                {
                    "id": second.id,
                    "label": "Pressure",
                    "code": "PRESSURE",
                    "data_type": "NUMBER",
                    "capture_at": "START",
                },
                {
                    "id": first.id,
                    "label": "Temperature",
                    "code": "TEMPERATURE",
                    "data_type": "NUMBER",
                    "capture_at": "START",
                },
            ]
        },
        format="json",
    )

    assert response.status_code == 200
    second.refresh_from_db()
    first.refresh_from_db()
    assert second.sequence == 1
    assert first.sequence == 2


def test_parameters_action_rejected_on_non_draft_version(organization):
    version = _version(organization, status=ProcessDefinitionVersion.Status.ACTIVE)
    client = _client_as("Export Coordinator", "coord7")

    response = client.patch(
        f"/api/v1/process-definition-versions/{version.id}/parameters/",
        {
            "parameters": [
                {
                    "label": "Temperature",
                    "code": "TEMPERATURE",
                    "data_type": "NUMBER",
                    "capture_at": "START",
                }
            ]
        },
        format="json",
    )

    assert response.status_code == 400
    assert version.parameters.count() == 0


def test_duplicate_clones_parameters(organization):
    version = _version(organization)
    ProcessParameterDefinition.objects.create(
        process_version=version,
        sequence=1,
        label="Temperature",
        code="TEMPERATURE",
        data_type=ProcessParameterDefinition.DataType.NUMBER,
        unit="°C",
        capture_at=ProcessParameterDefinition.CaptureAt.START,
        organization=organization,
    )
    client = _client_as("Export Coordinator", "coord8")

    response = client.post(
        f"/api/v1/process-definitions/{version.process_definition_id}/duplicate/"
    )

    assert response.status_code == 201
    copy_id = response.json()["id"]
    copy = ProcessDefinition.objects.get(id=copy_id)
    copy_version = copy.current_version()
    assert copy_version is not None
    assert copy_version.parameters.count() == 1
    assert copy_version.parameters.get().code == "TEMPERATURE"
