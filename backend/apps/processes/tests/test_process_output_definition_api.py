import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework.test import APIClient

from apps.items.models import Item
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


def _classification(organization, name="Grade A") -> OutputClassification:
    return OutputClassification.objects.create(name=name, organization=organization)


def _untrimmed_plate(organization) -> Item:
    return Item.objects.create(
        code="UNTRIM-10SQ",
        name="Untrimmed Plate",
        item_class=Item.ItemClass.WIP,
        organization=organization,
    )


def _scrap(organization) -> Item:
    return Item.objects.create(
        code="SCRAP",
        name="Wood Scrap",
        item_class=Item.ItemClass.SCRAP_BY_PRODUCT,
        organization=organization,
    )


def test_add_a_product_output(organization):
    version = _version(organization)
    plate = _untrimmed_plate(organization)
    classification = _classification(organization)
    client = _client_as("Export Coordinator", "coord1")

    response = client.patch(
        f"/api/v1/process-definition-versions/{version.id}/outputs/",
        {
            "outputs": [
                {
                    "item_type": "PRODUCT",
                    "item": plate.id,
                    "uom": "Piece",
                    "classification": classification.id,
                    "can_move_forward": True,
                    "creates_traceable_output": True,
                }
            ]
        },
        format="json",
    )

    assert response.status_code == 200
    row = version.outputs.get()
    assert row.item_type == "PRODUCT"
    assert row.item_id == plate.id
    assert row.classification_id == classification.id
    assert row.sequence == 1


def test_add_a_product_output_response_reflects_the_new_row(organization):
    # Regression test — see the matching test in
    # test_process_input_definition_api.py: the response used to be built
    # from a prefetch cache taken before this action's writes, so a freshly
    # added row was saved but silently missing from the PATCH response.
    version = _version(organization)
    plate = _untrimmed_plate(organization)
    classification = _classification(organization)
    client = _client_as("Export Coordinator", "coord1b")

    response = client.patch(
        f"/api/v1/process-definition-versions/{version.id}/outputs/",
        {
            "outputs": [
                {
                    "item_type": "PRODUCT",
                    "item": plate.id,
                    "uom": "Piece",
                    "classification": classification.id,
                }
            ]
        },
        format="json",
    )

    assert response.status_code == 200
    body_outputs = response.json()["outputs"]
    assert len(body_outputs) == 1
    assert body_outputs[0]["item_label"] == "Untrimmed Plate (UNTRIM-10SQ)"


def test_add_a_material_output(organization):
    version = _version(organization)
    scrap = _scrap(organization)
    classification = _classification(organization, name="Offcut")
    client = _client_as("Export Coordinator", "coord2")

    response = client.patch(
        f"/api/v1/process-definition-versions/{version.id}/outputs/",
        {
            "outputs": [
                {
                    "item_type": "MATERIAL",
                    "item": scrap.id,
                    "uom": "Kg",
                    "classification": classification.id,
                }
            ]
        },
        format="json",
    )

    assert response.status_code == 200
    row = version.outputs.get()
    assert row.item_type == "MATERIAL"
    assert row.item_id == scrap.id


def test_product_output_rejects_a_material_id(organization):
    version = _version(organization)
    scrap = _scrap(organization)
    classification = _classification(organization)
    client = _client_as("Export Coordinator", "coord3")

    response = client.patch(
        f"/api/v1/process-definition-versions/{version.id}/outputs/",
        {
            "outputs": [
                {
                    "item_type": "PRODUCT",
                    "item": scrap.id,
                    "uom": "Kg",
                    "classification": classification.id,
                }
            ]
        },
        format="json",
    )

    assert response.status_code == 400


def test_output_rejects_an_unknown_classification(organization):
    version = _version(organization)
    plate = _untrimmed_plate(organization)
    client = _client_as("Export Coordinator", "coord4")

    response = client.patch(
        f"/api/v1/process-definition-versions/{version.id}/outputs/",
        {
            "outputs": [
                {
                    "item_type": "PRODUCT",
                    "item": plate.id,
                    "uom": "Piece",
                    "classification": 999999,
                }
            ]
        },
        format="json",
    )

    assert response.status_code == 400


def test_multiple_outputs_can_all_stay_traceable(organization):
    version = _version(organization)
    premium_product = _untrimmed_plate(organization)
    reject_product = Item.objects.create(
        code="REJ-10SQ",
        name="Reject Plate",
        item_class=Item.ItemClass.WIP,
        organization=organization,
    )
    scrap = _scrap(organization)
    premium = _classification(organization, name="Top Grade")
    reject = _classification(organization, name="Rejected Batch")
    scrap_class = _classification(organization, name="Offcut")
    client = _client_as("Export Coordinator", "coord5")

    response = client.patch(
        f"/api/v1/process-definition-versions/{version.id}/outputs/",
        {
            "outputs": [
                {
                    "item_type": "PRODUCT",
                    "item": premium_product.id,
                    "uom": "Piece",
                    "classification": premium.id,
                    "creates_traceable_output": True,
                },
                {
                    "item_type": "PRODUCT",
                    "item": reject_product.id,
                    "uom": "Piece",
                    "classification": reject.id,
                    "creates_traceable_output": True,
                },
                {
                    "item_type": "MATERIAL",
                    "item": scrap.id,
                    "uom": "Kg",
                    "classification": scrap_class.id,
                    "creates_traceable_output": True,
                },
            ]
        },
        format="json",
    )

    assert response.status_code == 200
    rows = list(version.outputs.order_by("sequence"))
    assert len(rows) == 3
    assert all(row.creates_traceable_output for row in rows)


def test_whole_list_replace_updates_creates_and_deletes(organization):
    version = _version(organization)
    plate = _untrimmed_plate(organization)
    scrap = _scrap(organization)
    good = _classification(organization, name="Grade A")
    scrap_class = _classification(organization, name="Offcut")
    existing = ProcessOutputDefinition.objects.create(
        process_version=version,
        sequence=1,
        item_type=ProcessOutputDefinition.ItemType.PRODUCT,
        item=plate,
        uom="Piece",
        classification=good,
        organization=organization,
    )
    stale = ProcessOutputDefinition.objects.create(
        process_version=version,
        sequence=2,
        item_type=ProcessOutputDefinition.ItemType.MATERIAL,
        item=scrap,
        uom="Kg",
        classification=scrap_class,
        organization=organization,
    )
    client = _client_as("Export Coordinator", "coord6")

    response = client.patch(
        f"/api/v1/process-definition-versions/{version.id}/outputs/",
        {
            "outputs": [
                {
                    "id": existing.id,
                    "item_type": "PRODUCT",
                    "item": plate.id,
                    "uom": "Piece",
                    "classification": good.id,
                    "can_move_forward": False,
                }
            ]
        },
        format="json",
    )

    assert response.status_code == 200
    assert not ProcessOutputDefinition.objects.filter(id=stale.id).exists()
    row = version.outputs.get()
    assert row.id == existing.id
    assert row.can_move_forward is False


def test_reorder_via_resend_reassigns_sequence(organization):
    version = _version(organization)
    plate = _untrimmed_plate(organization)
    scrap = _scrap(organization)
    good = _classification(organization, name="Grade A")
    scrap_class = _classification(organization, name="Offcut")
    first = ProcessOutputDefinition.objects.create(
        process_version=version,
        sequence=1,
        item_type=ProcessOutputDefinition.ItemType.PRODUCT,
        item=plate,
        uom="Piece",
        classification=good,
        organization=organization,
    )
    second = ProcessOutputDefinition.objects.create(
        process_version=version,
        sequence=2,
        item_type=ProcessOutputDefinition.ItemType.MATERIAL,
        item=scrap,
        uom="Kg",
        classification=scrap_class,
        organization=organization,
    )
    client = _client_as("Export Coordinator", "coord7")

    response = client.patch(
        f"/api/v1/process-definition-versions/{version.id}/outputs/",
        {
            "outputs": [
                {
                    "id": second.id,
                    "item_type": "MATERIAL",
                    "item": scrap.id,
                    "uom": "Kg",
                    "classification": scrap_class.id,
                },
                {
                    "id": first.id,
                    "item_type": "PRODUCT",
                    "item": plate.id,
                    "uom": "Piece",
                    "classification": good.id,
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


def test_outputs_action_rejected_on_non_draft_version(organization):
    version = _version(organization, status=ProcessDefinitionVersion.Status.ACTIVE)
    plate = _untrimmed_plate(organization)
    classification = _classification(organization)
    client = _client_as("Export Coordinator", "coord8")

    response = client.patch(
        f"/api/v1/process-definition-versions/{version.id}/outputs/",
        {
            "outputs": [
                {
                    "item_type": "PRODUCT",
                    "item": plate.id,
                    "uom": "Piece",
                    "classification": classification.id,
                }
            ]
        },
        format="json",
    )

    assert response.status_code == 400
    assert version.outputs.count() == 0


def test_duplicate_clones_outputs(organization):
    version = _version(organization)
    plate = _untrimmed_plate(organization)
    classification = _classification(organization)
    ProcessOutputDefinition.objects.create(
        process_version=version,
        sequence=1,
        item_type=ProcessOutputDefinition.ItemType.PRODUCT,
        item=plate,
        uom="Piece",
        classification=classification,
        organization=organization,
    )
    client = _client_as("Export Coordinator", "coord9")

    response = client.post(
        f"/api/v1/process-definitions/{version.process_definition_id}/duplicate/"
    )

    assert response.status_code == 201
    copy_id = response.json()["id"]
    copy = ProcessDefinition.objects.get(id=copy_id)
    copy_version = copy.current_version()
    assert copy_version is not None
    assert copy_version.outputs.count() == 1
    assert copy_version.outputs.get().item_id == plate.id
