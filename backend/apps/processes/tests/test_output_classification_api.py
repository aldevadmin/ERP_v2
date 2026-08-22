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

pytestmark = pytest.mark.django_db

User = get_user_model()


def _client_as(role_name: str, username: str) -> APIClient:
    client = APIClient()
    user = User.objects.create_user(username=username, password="x")
    user.groups.add(Group.objects.get(name=role_name))
    client.force_authenticate(user=user)
    return client


def test_list_requires_authentication():
    client = APIClient()

    response = client.get("/api/v1/output-classifications/")

    assert response.status_code == 403


def test_list_returns_classifications(organization):
    OutputClassification.objects.create(name="Extra Premium", organization=organization)
    client = _client_as("Export Coordinator", "coord1")

    response = client.get("/api/v1/output-classifications/")

    assert response.status_code == 200
    assert response.json()["results"][0]["name"] == "Extra Premium"


def test_create_classification():
    client = _client_as("Export Coordinator", "coord2")

    response = client.post("/api/v1/output-classifications/", {"name": "Deluxe"}, format="json")

    assert response.status_code == 201
    classification = OutputClassification.objects.get(name="Deluxe")
    assert classification.organization_id is not None  # auto-defaulted, never sent by the client


def test_create_rejects_duplicate_name(organization):
    OutputClassification.objects.create(name="Damaged", organization=organization)
    client = _client_as("Export Coordinator", "coord3")

    response = client.post("/api/v1/output-classifications/", {"name": "Damaged"}, format="json")

    assert response.status_code == 400


def test_update_classification(organization):
    classification = OutputClassification.objects.create(name="Offcut", organization=organization)
    client = _client_as("Manager/Admin", "mgr1")

    response = client.patch(
        f"/api/v1/output-classifications/{classification.id}/",
        {"is_active": False},
        format="json",
    )

    assert response.status_code == 200
    classification.refresh_from_db()
    assert classification.is_active is False


def test_filter_by_is_active(organization):
    OutputClassification.objects.create(name="Grade A", organization=organization, is_active=True)
    OutputClassification.objects.create(name="Retired", organization=organization, is_active=False)
    client = _client_as("Export Coordinator", "coord4")

    response = client.get("/api/v1/output-classifications/?is_active=false")

    names = [c["name"] for c in response.json()["results"]]
    assert names == ["Retired"]


def test_delete_unused_classification_succeeds(organization):
    classification = OutputClassification.objects.create(name="Grade B", organization=organization)
    client = _client_as("Manager/Admin", "mgr2")

    response = client.delete(f"/api/v1/output-classifications/{classification.id}/")

    assert response.status_code == 204
    assert not OutputClassification.objects.filter(id=classification.id).exists()


def test_delete_classification_used_by_output_is_blocked(organization):
    classification = OutputClassification.objects.create(name="Grade B", organization=organization)
    category = ProcessCategory.objects.create(name="Production", organization=organization)
    definition = ProcessDefinition.objects.create(
        name="Pressing", code="PRESS", organization=organization
    )
    version = ProcessDefinitionVersion.objects.create(
        process_definition=definition,
        version_number=1,
        category=category,
        organization=organization,
    )
    material = Material.objects.create(
        code="OUT-1", name="Output Material", unit="Kg", organization=organization
    )
    ProcessOutputDefinition.objects.create(
        process_version=version,
        sequence=1,
        item_type=ProcessOutputDefinition.ItemType.MATERIAL,
        material=material,
        uom="Kg",
        classification=classification,
        organization=organization,
    )
    client = _client_as("Manager/Admin", "mgr3")

    response = client.delete(f"/api/v1/output-classifications/{classification.id}/")

    assert response.status_code == 400
    assert OutputClassification.objects.filter(id=classification.id).exists()
