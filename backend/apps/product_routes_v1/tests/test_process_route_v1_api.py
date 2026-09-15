import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework.test import APIClient

from apps.items.models import Item, ItemGroup
from apps.processes.models import ProcessCategory
from apps.processes_v1.models import ProcessDefinitionV1, ProcessDefinitionVersionV1
from apps.product_routes_v1.models import (
    ProcessRouteEdgeV1,
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


def _item_group(organization, name: str) -> ItemGroup:
    return ItemGroup.objects.create(name=name, organization=organization)


def _process(organization, code: str, *, output_group: ItemGroup | None = None) -> ProcessDefinitionVersionV1:
    category = ProcessCategory.objects.create(name=f"Cat-{code}", organization=organization)
    definition = ProcessDefinitionV1.objects.create(
        name=code, code=code, organization=organization
    )
    version = ProcessDefinitionVersionV1.objects.create(
        process_definition=definition, version_number=1, category=category, organization=organization
    )
    if output_group:
        from apps.processes_v1.models import ProcessOutputDefinitionV1

        ProcessOutputDefinitionV1.objects.create(
            process_version=version, sequence=1, item_group=output_group, uom="PC", organization=organization
        )
    return version


def _single_output_group(organization, code: str) -> tuple[ProcessDefinitionVersionV1, ItemGroup]:
    group = _item_group(organization, f"Group-{code}")
    version = _process(organization, code, output_group=group)
    return version, group


# ---------------------------------------------------------------------------
# Route CRUD
# ---------------------------------------------------------------------------


def test_create_creates_route_and_version_1_together(organization):
    group = _item_group(organization, "Plate Family")
    client = _client_as("Export Coordinator", "coord1")

    response = client.post(
        "/api/v1/product-routes-v1/",
        {"name": "Standard Plate Route", "item_group": group.id},
        format="json",
    )

    assert response.status_code == 201
    route = ProcessRouteV1.objects.get(name="Standard Plate Route")
    version = route.current_version()
    assert version is not None
    assert version.version_number == 1
    assert version.status == ProcessRouteVersionV1.Status.DRAFT


def test_create_forbidden_for_non_manager(organization):
    group = _item_group(organization, "Plate Family")
    client = _client_as("Packing Coordinator", "coord2")

    response = client.post(
        "/api/v1/product-routes-v1/", {"name": "Route", "item_group": group.id}, format="json"
    )

    assert response.status_code == 403


def test_duplicate_copies_nodes_edges_and_item_mappings(organization):
    group = _item_group(organization, "Plate Family")
    version_a, group_a = _single_output_group(organization, "STEPA")
    version_b, group_b = _single_output_group(organization, "STEPB")
    route = ProcessRouteV1.objects.create(name="Route", item_group=group, organization=organization)
    route_version = ProcessRouteVersionV1.objects.create(
        process_route=route, version_number=1, organization=organization
    )
    node_a = ProcessRouteNodeV1.objects.create(
        route_version=route_version,
        node_key="step-a",
        process_definition=version_a.process_definition,
        sequence_hint=1,
        organization=organization,
    )
    node_b = ProcessRouteNodeV1.objects.create(
        route_version=route_version,
        node_key="step-b",
        process_definition=version_b.process_definition,
        sequence_hint=2,
        organization=organization,
    )
    ProcessRouteEdgeV1.objects.create(
        route_version=route_version,
        source_node=node_a,
        target_node=node_b,
        disposition_type=ProcessRouteEdgeV1.Disposition.CONTINUE_TO_PROCESS,
        organization=organization,
    )
    finished = Item.objects.create(
        code="FG-1", name="Finished 1", item_class=Item.ItemClass.FINISHED_GOOD, organization=organization
    )
    output_a = version_a.outputs.first()
    from apps.product_routes_v1.models import ProcessRouteItemMappingV1

    resolved = Item.objects.create(
        code="WIP-A-1", name="Step A output", item_class=Item.ItemClass.WIP,
        item_group=group_a, organization=organization,
    )
    ProcessRouteItemMappingV1.objects.create(
        route_version=route_version, node=node_a, output_definition=output_a,
        target_item=finished, resolved_item=resolved, organization=organization,
    )
    client = _client_as("Export Coordinator", "coord3")

    response = client.post(f"/api/v1/product-routes-v1/{route.id}/duplicate/")

    assert response.status_code == 201
    copy = ProcessRouteV1.objects.get(id=response.json()["id"])
    copy_version = copy.current_version()
    assert copy_version.nodes.count() == 2
    assert copy_version.edges.count() == 1
    assert copy_version.item_mappings.count() == 1


# ---------------------------------------------------------------------------
# Nodes: linear auto-edges, branching leaves them alone
# ---------------------------------------------------------------------------


def test_nodes_auto_creates_linear_edges_for_single_output_processes(organization):
    group = _item_group(organization, "Family")
    version_a, _ = _single_output_group(organization, "LIN1")
    version_b, _ = _single_output_group(organization, "LIN2")
    route = ProcessRouteV1.objects.create(name="Linear", item_group=group, organization=organization)
    route_version = ProcessRouteVersionV1.objects.create(
        process_route=route, version_number=1, organization=organization
    )
    client = _client_as("Export Coordinator", "coord4")

    response = client.patch(
        f"/api/v1/product-route-versions-v1/{route_version.id}/nodes/",
        {
            "nodes": [
                {"process_definition": version_a.process_definition_id},
                {"process_definition": version_b.process_definition_id},
            ]
        },
        format="json",
    )

    assert response.status_code == 200
    route_version.refresh_from_db()
    assert route_version.edges.count() == 1
    edge = route_version.edges.first()
    assert edge.disposition_type == ProcessRouteEdgeV1.Disposition.CONTINUE_TO_PROCESS
    assert edge.source_output_definition_id is None


def test_nodes_does_not_auto_create_edges_for_branching_node(organization):
    group = _item_group(organization, "Family")
    category = ProcessCategory.objects.create(name="Grading Cat", organization=organization)
    definition = ProcessDefinitionV1.objects.create(name="Grading", code="GRADE", organization=organization)
    version = ProcessDefinitionVersionV1.objects.create(
        process_definition=definition, version_number=1, category=category, organization=organization
    )
    from apps.processes_v1.models import ProcessOutputDefinitionV1

    ProcessOutputDefinitionV1.objects.create(
        process_version=version, sequence=1, item_group=_item_group(organization, "Good"), uom="PC", organization=organization
    )
    ProcessOutputDefinitionV1.objects.create(
        process_version=version, sequence=2, item_group=_item_group(organization, "Reject"), uom="PC", organization=organization
    )
    version_next, _ = _single_output_group(organization, "AFTER")
    route = ProcessRouteV1.objects.create(name="Branch", item_group=group, organization=organization)
    route_version = ProcessRouteVersionV1.objects.create(
        process_route=route, version_number=1, organization=organization
    )
    client = _client_as("Export Coordinator", "coord5")

    response = client.patch(
        f"/api/v1/product-route-versions-v1/{route_version.id}/nodes/",
        {
            "nodes": [
                {"process_definition": definition.id},
                {"process_definition": version_next.process_definition_id},
            ]
        },
        format="json",
    )

    assert response.status_code == 200
    route_version.refresh_from_db()
    assert route_version.edges.count() == 0


# ---------------------------------------------------------------------------
# Activation
# ---------------------------------------------------------------------------


def test_activate_requires_at_least_one_step(organization):
    group = _item_group(organization, "Family")
    route = ProcessRouteV1.objects.create(name="Empty", item_group=group, organization=organization)
    route_version = ProcessRouteVersionV1.objects.create(
        process_route=route, version_number=1, organization=organization
    )
    client = _client_as("Export Coordinator", "coord6")

    response = client.post(f"/api/v1/product-route-versions-v1/{route_version.id}/activate/")

    assert response.status_code == 400


def test_activate_pins_process_definition_version_on_each_node(organization):
    group = _item_group(organization, "Family")
    version_a, _ = _single_output_group(organization, "PIN1")
    route = ProcessRouteV1.objects.create(name="Route", item_group=group, organization=organization)
    route_version = ProcessRouteVersionV1.objects.create(
        process_route=route, version_number=1, organization=organization
    )
    node = ProcessRouteNodeV1.objects.create(
        route_version=route_version, node_key="a", process_definition=version_a.process_definition,
        sequence_hint=1, organization=organization,
    )
    client = _client_as("Export Coordinator", "coord7")

    response = client.post(f"/api/v1/product-route-versions-v1/{route_version.id}/activate/")

    assert response.status_code == 200
    node.refresh_from_db()
    assert node.process_definition_version_id == version_a.id


def test_activate_clears_other_defaults_in_same_item_group(organization):
    group = _item_group(organization, "Family")
    version_a, _ = _single_output_group(organization, "DEF1")
    route1 = ProcessRouteV1.objects.create(name="Route 1", item_group=group, organization=organization)
    active_default = ProcessRouteVersionV1.objects.create(
        process_route=route1, version_number=1, status=ProcessRouteVersionV1.Status.ACTIVE,
        is_default=True, organization=organization,
    )
    route2 = ProcessRouteV1.objects.create(name="Route 2", item_group=group, organization=organization)
    version2 = ProcessRouteVersionV1.objects.create(
        process_route=route2, version_number=1, is_default=True, organization=organization
    )
    ProcessRouteNodeV1.objects.create(
        route_version=version2, node_key="a", process_definition=version_a.process_definition,
        sequence_hint=1, organization=organization,
    )
    client = _client_as("Export Coordinator", "coord8")

    response = client.post(f"/api/v1/product-route-versions-v1/{version2.id}/activate/")

    assert response.status_code == 200
    active_default.refresh_from_db()
    assert active_default.is_default is False
