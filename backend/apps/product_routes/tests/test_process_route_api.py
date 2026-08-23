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
from apps.product_routes.models import ProcessRoute, ProcessRouteVersion, StorageLocation

pytestmark = pytest.mark.django_db

User = get_user_model()


def _client_as(role_name: str, username: str) -> APIClient:
    client = APIClient()
    user = User.objects.create_user(username=username, password="x")
    user.groups.add(Group.objects.get(name=role_name))
    client.force_authenticate(user=user)
    return client


def _product(organization, sku_code: str = "PLATE-10", name: str = "10 Round Areca Plate") -> Item:
    return Item.objects.create(
        code=sku_code,
        name=name,
        item_class=Item.ItemClass.FINISHED_GOOD,
        organization=organization,
    )


def _classification(organization, name: str = "Good") -> OutputClassification:
    classification, _ = OutputClassification.objects.get_or_create(
        name=name, defaults={"organization": organization}
    )
    return classification


def _material(organization, code: str) -> Item:
    return Item.objects.create(
        code=code,
        name=f"Material {code}",
        item_class=Item.ItemClass.RAW_MATERIAL,
        organization=organization,
    )


def _process(
    organization, name: str, code: str, output_names: list[str] | None = None
) -> ProcessDefinition:
    """An ACTIVE process with one output per name in `output_names`
    (defaults to a single "Good" output — non-branching)."""
    category, _ = ProcessCategory.objects.get_or_create(
        name="Production", defaults={"organization": organization}
    )
    definition = ProcessDefinition.objects.create(name=name, code=code, organization=organization)
    version = ProcessDefinitionVersion.objects.create(
        process_definition=definition,
        version_number=1,
        status=ProcessDefinitionVersion.Status.ACTIVE,
        category=category,
        organization=organization,
    )
    for i, output_name in enumerate(output_names or ["Good"], start=1):
        ProcessOutputDefinition.objects.create(
            process_version=version,
            sequence=i,
            item_type=ProcessOutputDefinition.ItemType.MATERIAL,
            item=_material(organization, f"{code}-OUT-{i}"),
            uom="Kg",
            classification=_classification(organization, output_name),
            organization=organization,
        )
    return definition


def _route(organization, product: Item, name: str = "Standard Plate") -> ProcessRoute:
    definition = ProcessRoute.objects.create(name=name, item=product, organization=organization)
    ProcessRouteVersion.objects.create(
        process_route=definition, version_number=1, organization=organization
    )
    return definition


def test_create_route_creates_version_one(organization):
    product = _product(organization)
    client = _client_as("Manager/Admin", "mgr1")

    response = client.post(
        "/api/v1/product-routes/",
        {"name": "Standard Plate Production", "item": product.id, "is_default": True},
        format="json",
    )

    assert response.status_code == 201
    body = response.json()
    assert body["current_version"]["version_number"] == 1
    assert body["current_version"]["status"] == "DRAFT"
    assert body["current_version"]["is_default"] is True


def test_add_linear_steps_auto_creates_edges(organization):
    product = _product(organization)
    washing = _process(organization, "Washing", "WASH")
    pressing = _process(organization, "Pressing", "PRESS")
    route = _route(organization, product)
    version = route.current_version()
    client = _client_as("Manager/Admin", "mgr2")

    response = client.patch(
        f"/api/v1/product-route-versions/{version.id}/nodes/",
        {
            "nodes": [
                {"process_definition": washing.id},
                {"process_definition": pressing.id},
            ]
        },
        format="json",
    )

    assert response.status_code == 200
    body = response.json()
    assert len(body["nodes"]) == 2
    assert body["nodes"][0]["node_key"] == "washing"
    assert body["nodes"][1]["node_key"] == "pressing"
    assert len(body["edges"]) == 1
    edge = body["edges"][0]
    assert edge["source_node"] == body["nodes"][0]["id"]
    assert edge["target_node"] == body["nodes"][1]["id"]
    assert edge["source_output_definition"] is None


def test_branching_node_gets_no_auto_edge(organization):
    product = _product(organization)
    sorting = _process(organization, "Sorting", "SORT", ["Premium", "Standard", "Reject"])
    packing = _process(organization, "Packing", "PACK")
    route = _route(organization, product)
    version = route.current_version()
    client = _client_as("Manager/Admin", "mgr3")

    response = client.patch(
        f"/api/v1/product-route-versions/{version.id}/nodes/",
        {"nodes": [{"process_definition": sorting.id}, {"process_definition": packing.id}]},
        format="json",
    )

    assert response.status_code == 200
    assert response.json()["edges"] == []


def test_configure_sorting_branch_edges(organization):
    product = _product(organization)
    sorting = _process(organization, "Sorting", "SORT2", ["Premium", "Standard", "Reject"])
    packing = _process(organization, "Packing", "PACK2")
    route = _route(organization, product)
    version = route.current_version()
    client = _client_as("Manager/Admin", "mgr4")

    nodes_response = client.patch(
        f"/api/v1/product-route-versions/{version.id}/nodes/",
        {"nodes": [{"process_definition": sorting.id}, {"process_definition": packing.id}]},
        format="json",
    )
    nodes = nodes_response.json()["nodes"]
    sorting_node = nodes[0]
    packing_node = nodes[1]
    outputs = {o["classification_name"]: o["id"] for o in sorting_node["outputs"]}
    reject_store = StorageLocation.objects.create(name="Reject Store", organization=organization)

    response = client.patch(
        f"/api/v1/product-route-versions/{version.id}/edges/",
        {
            "edges": [
                {
                    "source_node": sorting_node["id"],
                    "source_output_definition": outputs["Premium"],
                    "disposition_type": "CONTINUE_TO_PROCESS",
                    "target_node": packing_node["id"],
                },
                {
                    "source_node": sorting_node["id"],
                    "source_output_definition": outputs["Standard"],
                    "disposition_type": "MOVE_TO_STORAGE",
                    "destination_location": reject_store.id,
                },
                {
                    "source_node": sorting_node["id"],
                    "source_output_definition": outputs["Reject"],
                    "disposition_type": "MOVE_TO_STORAGE",
                    "destination_location": reject_store.id,
                },
            ]
        },
        format="json",
    )

    assert response.status_code == 200
    assert len(response.json()["edges"]) == 3


def test_activate_requires_disposition_for_every_branch_output(organization):
    product = _product(organization)
    sorting = _process(organization, "Sorting", "SORT3", ["Premium", "Standard"])
    route = _route(organization, product)
    version = route.current_version()
    client = _client_as("Manager/Admin", "mgr5")

    client.patch(
        f"/api/v1/product-route-versions/{version.id}/nodes/",
        {"nodes": [{"process_definition": sorting.id}]},
        format="json",
    )

    response = client.post(f"/api/v1/product-route-versions/{version.id}/activate/")

    assert response.status_code == 400
    assert "disposition" in response.json()["detail"]


def test_activate_linear_route_succeeds_and_is_default(organization):
    product = _product(organization)
    washing = _process(organization, "Washing", "WASH2")
    route = _route(organization, product)
    version = route.current_version()
    version.is_default = True
    version.save()
    client = _client_as("Manager/Admin", "mgr6")

    client.patch(
        f"/api/v1/product-route-versions/{version.id}/nodes/",
        {"nodes": [{"process_definition": washing.id}]},
        format="json",
    )

    response = client.post(f"/api/v1/product-route-versions/{version.id}/activate/")

    assert response.status_code == 200
    version.refresh_from_db()
    assert version.status == "ACTIVE"
    node = version.nodes.get()
    assert node.process_definition_version_id is not None


def test_activating_new_default_clears_other_default_for_same_product(organization):
    product = _product(organization)
    washing = _process(organization, "Washing", "WASH3")

    old_route = _route(organization, product, name="Old Default")
    old_version = old_route.current_version()
    old_version.is_default = True
    old_version.save()
    client = _client_as("Manager/Admin", "mgr7")
    client.patch(
        f"/api/v1/product-route-versions/{old_version.id}/nodes/",
        {"nodes": [{"process_definition": washing.id}]},
        format="json",
    )
    client.post(f"/api/v1/product-route-versions/{old_version.id}/activate/")

    new_route = _route(organization, product, name="New Default")
    new_version = new_route.current_version()
    new_version.is_default = True
    new_version.save()
    client.patch(
        f"/api/v1/product-route-versions/{new_version.id}/nodes/",
        {"nodes": [{"process_definition": washing.id}]},
        format="json",
    )

    response = client.post(f"/api/v1/product-route-versions/{new_version.id}/activate/")

    assert response.status_code == 200
    old_version.refresh_from_db()
    assert old_version.is_default is False
    assert old_version.status == "ACTIVE"  # a different route, not archived — just un-defaulted


def test_update_active_version_is_rejected(organization):
    product = _product(organization)
    washing = _process(organization, "Washing", "WASH4")
    route = _route(organization, product)
    version = route.current_version()
    client = _client_as("Manager/Admin", "mgr8")
    client.patch(
        f"/api/v1/product-route-versions/{version.id}/nodes/",
        {"nodes": [{"process_definition": washing.id}]},
        format="json",
    )
    client.post(f"/api/v1/product-route-versions/{version.id}/activate/")

    response = client.patch(
        f"/api/v1/product-route-versions/{version.id}/nodes/",
        {"nodes": []},
        format="json",
    )

    assert response.status_code == 400


def test_duplicate_route_clones_nodes_and_edges(organization):
    product = _product(organization)
    washing = _process(organization, "Washing", "WASH5")
    pressing = _process(organization, "Pressing", "PRESS5")
    route = _route(organization, product)
    version = route.current_version()
    client = _client_as("Export Coordinator", "coord1")
    client.patch(
        f"/api/v1/product-route-versions/{version.id}/nodes/",
        {"nodes": [{"process_definition": washing.id}, {"process_definition": pressing.id}]},
        format="json",
    )

    response = client.post(f"/api/v1/product-routes/{route.id}/duplicate/")

    assert response.status_code == 201
    copy = ProcessRoute.objects.get(id=response.json()["id"])
    copy_version = copy.current_version()
    assert copy_version.nodes.count() == 2
    assert copy_version.edges.count() == 1


def test_multiple_routes_per_product(organization):
    product = _product(organization)
    _route(organization, product, name="Standard")
    _route(organization, product, name="Drying")
    _route(organization, product, name="Store After Trimming")
    client = _client_as("Export Coordinator", "coord2")

    response = client.get(f"/api/v1/product-routes/?item={product.id}")

    assert response.status_code == 200
    assert response.json()["count"] == 3


def test_node_key_dedupes_on_collision(organization):
    product = _product(organization)
    washing1 = _process(organization, "Washing", "WASHA")
    washing2 = _process(organization, "Washing", "WASHB")
    route = _route(organization, product)
    version = route.current_version()
    client = _client_as("Manager/Admin", "mgr9")

    response = client.patch(
        f"/api/v1/product-route-versions/{version.id}/nodes/",
        {"nodes": [{"process_definition": washing1.id}, {"process_definition": washing2.id}]},
        format="json",
    )

    keys = [n["node_key"] for n in response.json()["nodes"]]
    assert keys == ["washing", "washing-2"]


def test_delete_route_succeeds(organization):
    product = _product(organization)
    route = _route(organization, product)
    client = _client_as("Manager/Admin", "mgr10")

    response = client.delete(f"/api/v1/product-routes/{route.id}/")

    assert response.status_code == 204
    assert not ProcessRoute.objects.filter(id=route.id).exists()


def test_delete_unused_storage_location_succeeds(organization):
    location = StorageLocation.objects.create(name="Spare Store", organization=organization)
    client = _client_as("Manager/Admin", "mgr11")

    response = client.delete(f"/api/v1/storage-locations/{location.id}/")

    assert response.status_code == 204
    assert not StorageLocation.objects.filter(id=location.id).exists()


def test_delete_storage_location_used_by_edge_is_blocked(organization):
    product = _product(organization)
    sorting = _process(organization, "Sorting", "SORT3", ["Premium", "Reject"])
    route = _route(organization, product)
    version = route.current_version()
    client = _client_as("Manager/Admin", "mgr12")

    nodes_response = client.patch(
        f"/api/v1/product-route-versions/{version.id}/nodes/",
        {"nodes": [{"process_definition": sorting.id}]},
        format="json",
    )
    sorting_node = nodes_response.json()["nodes"][0]
    outputs = {o["classification_name"]: o["id"] for o in sorting_node["outputs"]}
    reject_store = StorageLocation.objects.create(name="Reject Store 2", organization=organization)
    client.patch(
        f"/api/v1/product-route-versions/{version.id}/edges/",
        {
            "edges": [
                {
                    "source_node": sorting_node["id"],
                    "source_output_definition": outputs["Premium"],
                    "disposition_type": "MOVE_TO_STORAGE",
                    "destination_location": reject_store.id,
                },
                {
                    "source_node": sorting_node["id"],
                    "source_output_definition": outputs["Reject"],
                    "disposition_type": "MOVE_TO_STORAGE",
                    "destination_location": reject_store.id,
                },
            ]
        },
        format="json",
    )

    response = client.delete(f"/api/v1/storage-locations/{reject_store.id}/")

    assert response.status_code == 400
    assert StorageLocation.objects.filter(id=reject_store.id).exists()
