import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework.test import APIClient

from apps.items.models import Item, ItemGroup
from apps.processes.models import OutputClassification, ProcessCategory
from apps.processes_v1.models import (
    ProcessDefinitionV1,
    ProcessDefinitionVersionV1,
    ProcessInputDefinitionV1,
    ProcessOutputDefinitionV1,
)
from apps.product_routes_v1.models import (
    ProcessRouteNodeV1,
    ProcessRouteV1,
    ProcessRouteVersionV1,
)

pytestmark = pytest.mark.django_db

User = get_user_model()


def _client_as(role_name: str, username: str) -> APIClient:
    client = APIClient()
    user = User.objects.create_user(username=username, password="x")
    user.groups.add(Group.objects.get(name=role_name))
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def item_group(organization) -> ItemGroup:
    return ItemGroup.objects.create(name="WIP Sorted Plate", organization=organization)


@pytest.fixture
def other_item_group(organization) -> ItemGroup:
    return ItemGroup.objects.create(name="Some Other Group", organization=organization)


@pytest.fixture
def node(organization, item_group) -> ProcessRouteNodeV1:
    category = ProcessCategory.objects.create(name="Cat", organization=organization)
    definition = ProcessDefinitionV1.objects.create(
        name="Grading", code="GRADE1", organization=organization
    )
    version = ProcessDefinitionVersionV1.objects.create(
        process_definition=definition, version_number=1, category=category, organization=organization
    )
    ProcessOutputDefinitionV1.objects.create(
        process_version=version, sequence=1, item_group=item_group,
        classification=OutputClassification.objects.get(name="Good"),
        uom="PC", organization=organization,
    )
    route = ProcessRouteV1.objects.create(
        name="Route", item_group=item_group, organization=organization
    )
    route_version = ProcessRouteVersionV1.objects.create(
        process_route=route, version_number=1, organization=organization
    )
    return ProcessRouteNodeV1.objects.create(
        route_version=route_version, node_key="grading", process_definition=definition,
        sequence_hint=1, organization=organization,
    )


@pytest.fixture
def output_definition(node) -> ProcessOutputDefinitionV1:
    version = node.process_definition.current_version()
    return version.outputs.first()


@pytest.fixture
def target_item(organization) -> Item:
    return Item.objects.create(
        code="FG-10SQ", name="Finished 10x10", item_class=Item.ItemClass.FINISHED_GOOD,
        organization=organization,
    )


def _url(node) -> str:
    return f"/api/v1/product-route-versions-v1/{node.route_version_id}/item_mappings/"


def test_creates_a_mapping(organization, node, output_definition, target_item, item_group):
    good = Item.objects.create(
        code="WIP-GOOD", name="Good plate", item_class=Item.ItemClass.WIP,
        item_group=item_group, classification=OutputClassification.objects.get(name="Good"),
        organization=organization,
    )
    client = _client_as("Export Coordinator", "coord1")

    response = client.patch(
        _url(node),
        {
            "item_mappings": [
                {
                    "node": node.id,
                    "output_definition": output_definition.id,
                    "target_item": target_item.id,
                    "resolved_item": good.id,
                }
            ]
        },
        format="json",
    )

    assert response.status_code == 200
    assert node.route_version.item_mappings.count() == 1


def test_rejects_resolved_item_from_wrong_group(organization, node, output_definition, target_item, other_item_group):
    wrong_group_item = Item.objects.create(
        code="WIP-WRONG", name="Wrong group item", item_class=Item.ItemClass.WIP,
        item_group=other_item_group, organization=organization,
    )
    client = _client_as("Export Coordinator", "coord2")

    response = client.patch(
        _url(node),
        {
            "item_mappings": [
                {
                    "node": node.id,
                    "output_definition": output_definition.id,
                    "target_item": target_item.id,
                    "resolved_item": wrong_group_item.id,
                }
            ]
        },
        format="json",
    )

    assert response.status_code == 400


def test_rejects_resolved_item_with_mismatched_classification(organization, node, output_definition, target_item, item_group):
    reject_grade_item = Item.objects.create(
        code="WIP-REJECT", name="Reject grade item", item_class=Item.ItemClass.WIP,
        item_group=item_group, classification=OutputClassification.objects.get(name="Reject"),
        organization=organization,
    )
    client = _client_as("Export Coordinator", "coord3")

    response = client.patch(
        _url(node),
        {
            "item_mappings": [
                {
                    "node": node.id,
                    "output_definition": output_definition.id,
                    "target_item": target_item.id,
                    "resolved_item": reject_grade_item.id,
                }
            ]
        },
        format="json",
    )

    assert response.status_code == 400


def test_rejects_both_input_and_output_definition_set(organization, node, output_definition, target_item, item_group):
    good = Item.objects.create(
        code="WIP-GOOD2", name="Good plate", item_class=Item.ItemClass.WIP,
        item_group=item_group, organization=organization,
    )
    input_def = ProcessInputDefinitionV1.objects.create(
        process_version=output_definition.process_version, sequence=99, item_group=item_group,
        uom="PC", organization=organization,
    )
    client = _client_as("Export Coordinator", "coord4")

    response = client.patch(
        _url(node),
        {
            "item_mappings": [
                {
                    "node": node.id,
                    "input_definition": input_def.id,
                    "output_definition": output_definition.id,
                    "target_item": target_item.id,
                    "resolved_item": good.id,
                }
            ]
        },
        format="json",
    )

    assert response.status_code == 400


def test_rejects_neither_input_nor_output_definition_set(organization, node, target_item, item_group):
    good = Item.objects.create(
        code="WIP-GOOD3", name="Good plate", item_class=Item.ItemClass.WIP,
        item_group=item_group, organization=organization,
    )
    client = _client_as("Export Coordinator", "coord5")

    response = client.patch(
        _url(node),
        {"item_mappings": [{"node": node.id, "target_item": target_item.id, "resolved_item": good.id}]},
        format="json",
    )

    assert response.status_code == 400


def test_rejects_target_item_of_wrong_item_class(organization, node, output_definition, item_group):
    good = Item.objects.create(
        code="WIP-GOOD4", name="Good plate", item_class=Item.ItemClass.WIP,
        item_group=item_group, organization=organization,
    )
    raw_target = Item.objects.create(
        code="RAW-1", name="Raw material", item_class=Item.ItemClass.RAW_MATERIAL,
        organization=organization,
    )
    client = _client_as("Export Coordinator", "coord6")

    response = client.patch(
        _url(node),
        {
            "item_mappings": [
                {
                    "node": node.id,
                    "output_definition": output_definition.id,
                    "target_item": raw_target.id,
                    "resolved_item": good.id,
                }
            ]
        },
        format="json",
    )

    assert response.status_code == 400
