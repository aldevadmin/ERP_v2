import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework.test import APIClient

from apps.items.models import Item
from apps.processes.models import (
    ProcessCategory,
    ProcessDefinition,
    ProcessDefinitionVersion,
    ProcessInputDefinition,
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


def _leaf(organization) -> Item:
    return Item.objects.create(
        code="LEAF",
        name="Raw Leaf",
        item_class=Item.ItemClass.RAW_MATERIAL,
        organization=organization,
    )


def _untrimmed_plate(organization) -> Item:
    return Item.objects.create(
        code="UNTRIM-10SQ",
        name="Untrimmed Plate",
        item_class=Item.ItemClass.WIP,
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
    assert row.item_id == leaf.id
    assert row.sequence == 1


def test_add_a_material_input_response_reflects_the_new_row(organization):
    # Regression test: `get_object()` prefetches `inputs` before this
    # action's writes, and the response used to be built from that same
    # stale cache — the row was saved correctly but never showed up in the
    # PATCH response, so the UI list appeared to silently drop it until a
    # reload. Assert on the response body itself, not just the DB.
    version = _version(organization)
    leaf = _leaf(organization)
    client = _client_as("Export Coordinator", "coord1b")

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
            ]
        },
        format="json",
    )

    assert response.status_code == 200
    body_inputs = response.json()["inputs"]
    assert len(body_inputs) == 1
    assert body_inputs[0]["item_label"] == "Raw Leaf (LEAF)"


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
    assert row.item_id == plate.id


def test_wip_input_rejects_a_finished_good_product(organization):
    version = _version(organization)
    finished = Item.objects.create(
        code="SQ10",
        name="Finished Plate",
        item_class=Item.ItemClass.FINISHED_GOOD,
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
    stem = Item.objects.create(
        code="STEM", name="Stem", item_class=Item.ItemClass.RAW_MATERIAL, organization=organization
    )
    existing = ProcessInputDefinition.objects.create(
        process_version=version,
        sequence=1,
        input_type=ProcessInputDefinition.InputType.MATERIAL,
        item=leaf,
        uom="Kg",
        organization=organization,
    )
    stale = ProcessInputDefinition.objects.create(
        process_version=version,
        sequence=2,
        input_type=ProcessInputDefinition.InputType.MATERIAL,
        item=stem,
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
    assert rows[1].item_id == stem.id


def test_reorder_via_resend_reassigns_sequence(organization):
    version = _version(organization)
    leaf = _leaf(organization)
    stem = Item.objects.create(
        code="STEM", name="Stem", item_class=Item.ItemClass.RAW_MATERIAL, organization=organization
    )
    first = ProcessInputDefinition.objects.create(
        process_version=version,
        sequence=1,
        input_type=ProcessInputDefinition.InputType.MATERIAL,
        item=leaf,
        uom="Kg",
        organization=organization,
    )
    second = ProcessInputDefinition.objects.create(
        process_version=version,
        sequence=2,
        input_type=ProcessInputDefinition.InputType.MATERIAL,
        item=stem,
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
