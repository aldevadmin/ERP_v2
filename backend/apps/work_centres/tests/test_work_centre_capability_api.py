import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework.test import APIClient

from apps.processes.models import ProcessCategory, ProcessDefinition, ProcessDefinitionVersion
from apps.work_centres.models import WorkCentre, WorkCentreProcessCapability, WorkCentreType

pytestmark = pytest.mark.django_db

User = get_user_model()


def _client_as(role_name: str, username: str) -> APIClient:
    client = APIClient()
    user = User.objects.create_user(username=username, password="x")
    user.groups.add(Group.objects.get(name=role_name))
    client.force_authenticate(user=user)
    return client


def _work_centre(organization) -> WorkCentre:
    work_centre_type, _ = WorkCentreType.objects.get_or_create(
        name="Machine", defaults={"organization": organization}
    )
    return WorkCentre.objects.create(
        code="WC-1", name="Press 01", type=work_centre_type, organization=organization
    )


def _process(organization, name="Pressing", code="PRESS") -> ProcessDefinition:
    category, _ = ProcessCategory.objects.get_or_create(
        name="Production", defaults={"organization": organization}
    )
    definition = ProcessDefinition.objects.create(name=name, code=code, organization=organization)
    ProcessDefinitionVersion.objects.create(
        process_definition=definition,
        version_number=1,
        category=category,
        organization=organization,
    )
    return definition


def test_add_a_capability_with_standard_rate(organization):
    work_centre = _work_centre(organization)
    process = _process(organization)
    client = _client_as("Export Coordinator", "coord1")

    response = client.patch(
        f"/api/v1/work-centres/{work_centre.id}/capabilities/",
        {"capabilities": [{"process_definition": process.id, "standard_rate": "120.50"}]},
        format="json",
    )

    assert response.status_code == 200
    capability = work_centre.capabilities.get()
    assert capability.process_definition_id == process.id
    assert str(capability.standard_rate) == "120.50"


def test_add_a_capability_without_standard_rate(organization):
    work_centre = _work_centre(organization)
    process = _process(organization)
    client = _client_as("Export Coordinator", "coord2")

    response = client.patch(
        f"/api/v1/work-centres/{work_centre.id}/capabilities/",
        {"capabilities": [{"process_definition": process.id}]},
        format="json",
    )

    assert response.status_code == 200
    capability = work_centre.capabilities.get()
    assert capability.standard_rate is None


def test_rejects_the_same_process_twice_in_one_payload(organization):
    work_centre = _work_centre(organization)
    process = _process(organization)
    client = _client_as("Export Coordinator", "coord3")

    response = client.patch(
        f"/api/v1/work-centres/{work_centre.id}/capabilities/",
        {
            "capabilities": [
                {"process_definition": process.id},
                {"process_definition": process.id, "standard_rate": "50"},
            ]
        },
        format="json",
    )

    assert response.status_code == 400
    assert work_centre.capabilities.count() == 0


def test_whole_list_replace_updates_creates_and_deletes(organization):
    work_centre = _work_centre(organization)
    pressing = _process(organization, name="Pressing", code="PRESS")
    packing = _process(organization, name="Packing", code="PACK")
    existing = WorkCentreProcessCapability.objects.create(
        work_centre=work_centre,
        process_definition=pressing,
        standard_rate=100,
        organization=organization,
    )
    stale = WorkCentreProcessCapability.objects.create(
        work_centre=work_centre,
        process_definition=packing,
        standard_rate=50,
        organization=organization,
    )
    client = _client_as("Export Coordinator", "coord4")

    response = client.patch(
        f"/api/v1/work-centres/{work_centre.id}/capabilities/",
        {
            "capabilities": [
                {"id": existing.id, "process_definition": pressing.id, "standard_rate": "150"}
            ]
        },
        format="json",
    )

    assert response.status_code == 200
    assert not WorkCentreProcessCapability.objects.filter(id=stale.id).exists()
    capability = work_centre.capabilities.get()
    assert capability.id == existing.id
    assert str(capability.standard_rate) == "150.00"


def test_delete_all_capabilities(organization):
    work_centre = _work_centre(organization)
    process = _process(organization)
    WorkCentreProcessCapability.objects.create(
        work_centre=work_centre, process_definition=process, organization=organization
    )
    client = _client_as("Export Coordinator", "coord5")

    response = client.patch(
        f"/api/v1/work-centres/{work_centre.id}/capabilities/",
        {"capabilities": []},
        format="json",
    )

    assert response.status_code == 200
    assert work_centre.capabilities.count() == 0
