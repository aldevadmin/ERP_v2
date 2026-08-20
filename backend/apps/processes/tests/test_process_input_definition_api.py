import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework.test import APIClient

from apps.materials.models import Material
from apps.processes.models import (
    ProcessCategory,
    ProcessDefinition,
    ProcessDefinitionVersion,
    ProcessInputDefinition,
)
from apps.products.models import Product

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


def _leaf(organization) -> Material:
    return Material.objects.create(
        code="LEAF", name="Raw Leaf", unit="Kg", organization=organization
    )


def _untrimmed_plate(organization) -> Product:
    return Product.objects.create(
        sku_code="UNTRIM-10SQ",
        name="Untrimmed Plate",
        base_unit="Piece",
        stage=Product.Stage.SEMI_FINISHED,
        organization=organization,
    )


def test_add_a_material_input(organization):
    version = _version(organization)
    leaf = _leaf(organization)
    client = _client_as("Export Coordinator", "coord1")

    response = client.patch(
        f"/api/v1/process-definition-versions/{version.id}/inputs/",
        {
            "inputs": [
                {
                    "input_type": "MATERIAL",
                    "item": leaf.id,
                    "uom": "Kg",
                    "quantity_capture": "MANUAL",
                    "is_required": True,
                }
            ],
            "batch_lot_mode": "REQUIRED",
        },
        format="json",
    )

    assert response.status_code == 200
    version.refresh_from_db()
    assert version.batch_lot_mode == "REQUIRED"
    row = version.inputs.get()
    assert row.input_type == "MATERIAL"
    assert row.material_id == leaf.id
    assert row.product_id is None
    assert row.sequence == 1


def test_add_a_wip_input_resolves_to_semi_finished_product(organization):
    version = _version(organization)
    plate = _untrimmed_plate(organization)
    client = _client_as("Export Coordinator", "coord2")

    response = client.patch(
        f"/api/v1/process-definition-versions/{version.id}/inputs/",
        {"inputs": [{"input_type": "WIP", "item": plate.id, "uom": "Piece"}]},
        format="json",
    )

    assert response.status_code == 200
    row = version.inputs.get()
    assert row.input_type == "WIP"
    assert row.product_id == plate.id
    assert row.material_id is None


def test_wip_input_rejects_a_finished_good_product(organization):
    version = _version(organization)
    finished = Product.objects.create(
        sku_code="SQ10",
        name="Finished Plate",
        base_unit="Piece",
        stage=Product.Stage.FINISHED_GOOD,
        organization=organization,
    )
    client = _client_as("Export Coordinator", "coord3")

    response = client.patch(
        f"/api/v1/process-definition-versions/{version.id}/inputs/",
        {"inputs": [{"input_type": "WIP", "item": finished.id, "uom": "Piece"}]},
        format="json",
    )

    assert response.status_code == 400


def test_material_input_rejects_a_product_id(organization):
    version = _version(organization)
    plate = _untrimmed_plate(organization)
    client = _client_as("Export Coordinator", "coord4")

    response = client.patch(
        f"/api/v1/process-definition-versions/{version.id}/inputs/",
        {"inputs": [{"input_type": "MATERIAL", "item": plate.id, "uom": "Piece"}]},
        format="json",
    )

    assert response.status_code == 400


def test_whole_list_replace_updates_creates_and_deletes(organization):
    version = _version(organization)
    leaf = _leaf(organization)
    stem = Material.objects.create(code="STEM", name="Stem", unit="Kg", organization=organization)
    existing = ProcessInputDefinition.objects.create(
        process_version=version,
        sequence=1,
        input_type=ProcessInputDefinition.InputType.MATERIAL,
        material=leaf,
        uom="Kg",
        organization=organization,
    )
    stale = ProcessInputDefinition.objects.create(
        process_version=version,
        sequence=2,
        input_type=ProcessInputDefinition.InputType.MATERIAL,
        material=stem,
        uom="Kg",
        organization=organization,
    )
    client = _client_as("Export Coordinator", "coord5")

    response = client.patch(
        f"/api/v1/process-definition-versions/{version.id}/inputs/",
        {
            "inputs": [
                {
                    "id": existing.id,
                    "input_type": "MATERIAL",
                    "item": leaf.id,
                    "uom": "Kg",
                    "is_required": False,
                },
                {"input_type": "MATERIAL", "item": stem.id, "uom": "Kg"},
            ]
        },
        format="json",
    )

    assert response.status_code == 200
    assert not ProcessInputDefinition.objects.filter(id=stale.id).exists()
    rows = list(version.inputs.order_by("sequence"))
    assert len(rows) == 2
    assert rows[0].id == existing.id
    assert rows[0].is_required is False
    assert rows[1].material_id == stem.id


def test_reorder_via_resend_reassigns_sequence(organization):
    version = _version(organization)
    leaf = _leaf(organization)
    stem = Material.objects.create(code="STEM", name="Stem", unit="Kg", organization=organization)
    first = ProcessInputDefinition.objects.create(
        process_version=version,
        sequence=1,
        input_type=ProcessInputDefinition.InputType.MATERIAL,
        material=leaf,
        uom="Kg",
        organization=organization,
    )
    second = ProcessInputDefinition.objects.create(
        process_version=version,
        sequence=2,
        input_type=ProcessInputDefinition.InputType.MATERIAL,
        material=stem,
        uom="Kg",
        organization=organization,
    )
    client = _client_as("Export Coordinator", "coord6")

    response = client.patch(
        f"/api/v1/process-definition-versions/{version.id}/inputs/",
        {
            "inputs": [
                {"id": second.id, "input_type": "MATERIAL", "item": stem.id, "uom": "Kg"},
                {"id": first.id, "input_type": "MATERIAL", "item": leaf.id, "uom": "Kg"},
            ]
        },
        format="json",
    )

    assert response.status_code == 200
    second.refresh_from_db()
    first.refresh_from_db()
    assert second.sequence == 1
    assert first.sequence == 2


def test_inputs_action_rejected_on_non_draft_version(organization):
    version = _version(organization, status=ProcessDefinitionVersion.Status.ACTIVE)
    leaf = _leaf(organization)
    client = _client_as("Export Coordinator", "coord7")

    response = client.patch(
        f"/api/v1/process-definition-versions/{version.id}/inputs/",
        {"inputs": [{"input_type": "MATERIAL", "item": leaf.id, "uom": "Kg"}]},
        format="json",
    )

    assert response.status_code == 400
    assert version.inputs.count() == 0
