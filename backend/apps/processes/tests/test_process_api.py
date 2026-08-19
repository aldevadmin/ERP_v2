import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework.test import APIClient

from apps.materials.models import Material
from apps.processes.models import Process, ProcessCategory

pytestmark = pytest.mark.django_db

User = get_user_model()


def _client_as(role_name: str, username: str) -> APIClient:
    client = APIClient()
    user = User.objects.create_user(username=username, password="x")
    user.groups.add(Group.objects.get(name=role_name))
    client.force_authenticate(user=user)
    return client


def _category(organization, name: str = "Production") -> ProcessCategory:
    return ProcessCategory.objects.create(name=name, organization=organization)


def test_list_requires_authentication():
    client = APIClient()

    response = client.get("/api/v1/processes/")

    assert response.status_code == 403


def test_list_returns_processes(organization):
    category = _category(organization)
    Process.objects.create(
        name="Washing",
        category=category,
        resource_type=Process.ResourceType.STATION,
        organization=organization,
    )
    client = _client_as("Export Coordinator", "coord1")

    response = client.get("/api/v1/processes/")

    assert response.status_code == 200
    result = response.json()["results"][0]
    assert result["name"] == "Washing"
    assert result["category_name"] == "Production"
    assert result["inputs"] == []
    assert result["outputs"] == []


def test_create_process_with_inputs_and_outputs(organization):
    category = _category(organization)
    leaf = Material.objects.create(
        code="LEAF", name="Raw Leaf", unit="Kg", organization=organization
    )
    plate = Material.objects.create(
        code="PLATE", name="Pressed Plate", unit="Piece", organization=organization
    )
    client = _client_as("Export Coordinator", "coord2")

    response = client.post(
        "/api/v1/processes/",
        {
            "name": "Pressing",
            "category": category.id,
            "resource_type": "MACHINE",
            "inputs": [leaf.id],
            "outputs": [plate.id],
            "description": "Presses raw leaf into a plate shape.",
        },
        format="json",
    )

    assert response.status_code == 201
    process = Process.objects.get(name="Pressing")
    assert process.organization_id is not None  # auto-defaulted, never sent by the client
    assert list(process.inputs.values_list("id", flat=True)) == [leaf.id]
    assert list(process.outputs.values_list("id", flat=True)) == [plate.id]


def test_update_process_replaces_inputs(organization):
    category = _category(organization)
    leaf = Material.objects.create(
        code="LEAF", name="Raw Leaf", unit="Kg", organization=organization
    )
    stem = Material.objects.create(code="STEM", name="Stem", unit="Kg", organization=organization)
    process = Process.objects.create(
        name="Washing",
        category=category,
        resource_type=Process.ResourceType.STATION,
        organization=organization,
    )
    process.inputs.set([leaf])
    client = _client_as("Manager/Admin", "mgr1")

    response = client.patch(
        f"/api/v1/processes/{process.id}/", {"inputs": [stem.id]}, format="json"
    )

    assert response.status_code == 200
    process.refresh_from_db()
    assert list(process.inputs.values_list("id", flat=True)) == [stem.id]


def test_filter_by_category(organization):
    production = _category(organization, "Production")
    quality = _category(organization, "Quality")
    Process.objects.create(
        name="Washing",
        category=production,
        resource_type=Process.ResourceType.STATION,
        organization=organization,
    )
    Process.objects.create(
        name="Sorting",
        category=quality,
        resource_type=Process.ResourceType.STATION,
        organization=organization,
    )
    client = _client_as("Export Coordinator", "coord3")

    response = client.get(f"/api/v1/processes/?category={quality.id}")

    names = [p["name"] for p in response.json()["results"]]
    assert names == ["Sorting"]


def test_filter_by_is_active(organization):
    category = _category(organization)
    Process.objects.create(
        name="Active Proc",
        category=category,
        resource_type=Process.ResourceType.STATION,
        organization=organization,
        is_active=True,
    )
    Process.objects.create(
        name="Inactive Proc",
        category=category,
        resource_type=Process.ResourceType.STATION,
        organization=organization,
        is_active=False,
    )
    client = _client_as("Export Coordinator", "coord4")

    response = client.get("/api/v1/processes/?is_active=false")

    names = [p["name"] for p in response.json()["results"]]
    assert names == ["Inactive Proc"]


def test_search_by_name(organization):
    category = _category(organization)
    Process.objects.create(
        name="Washing",
        category=category,
        resource_type=Process.ResourceType.STATION,
        organization=organization,
    )
    Process.objects.create(
        name="Sorting",
        category=category,
        resource_type=Process.ResourceType.STATION,
        organization=organization,
    )
    client = _client_as("Export Coordinator", "coord5")

    response = client.get("/api/v1/processes/?search=Wash")

    names = [p["name"] for p in response.json()["results"]]
    assert names == ["Washing"]


def test_duplicate_creates_a_renamed_copy_with_same_inputs_outputs(organization):
    category = _category(organization)
    leaf = Material.objects.create(
        code="LEAF", name="Raw Leaf", unit="Kg", organization=organization
    )
    plate = Material.objects.create(
        code="PLATE", name="Pressed Plate", unit="Piece", organization=organization
    )
    process = Process.objects.create(
        name="Pressing",
        category=category,
        resource_type=Process.ResourceType.MACHINE,
        organization=organization,
    )
    process.inputs.set([leaf])
    process.outputs.set([plate])
    client = _client_as("Export Coordinator", "coord6")

    response = client.post(f"/api/v1/processes/{process.id}/duplicate/")

    assert response.status_code == 201
    body = response.json()
    assert body["id"] != process.id
    assert body["name"] == "Pressing (Copy)"
    assert body["is_active"] is True
    copy = Process.objects.get(id=body["id"])
    assert list(copy.inputs.values_list("id", flat=True)) == [leaf.id]
    assert list(copy.outputs.values_list("id", flat=True)) == [plate.id]


def test_no_delete_route(organization):
    category = _category(organization)
    process = Process.objects.create(
        name="Washing",
        category=category,
        resource_type=Process.ResourceType.STATION,
        organization=organization,
    )
    client = _client_as("Manager/Admin", "mgr2")

    response = client.delete(f"/api/v1/processes/{process.id}/")

    assert response.status_code == 405
