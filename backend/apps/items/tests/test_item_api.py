import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework.test import APIClient

from apps.items.models import UOM, Item, MaterialType, ProductType

pytestmark = pytest.mark.django_db

User = get_user_model()


def _client_as(role_name: str, username: str) -> APIClient:
    client = APIClient()
    user = User.objects.create_user(username=username, password="x")
    user.groups.add(Group.objects.get(name=role_name))
    client.force_authenticate(user=user)
    return client


def _product_type(organization, name: str = "Plate") -> ProductType:
    obj, _ = ProductType.objects.get_or_create(name=name, defaults={"organization": organization})
    return obj


def _material_type(organization, name: str = "Areca Palm") -> MaterialType:
    obj, _ = MaterialType.objects.get_or_create(name=name, defaults={"organization": organization})
    return obj


def _uom(organization, code: str = "PC") -> UOM:
    obj, _ = UOM.objects.get_or_create(
        code=code, defaults={"name": code, "organization": organization}
    )
    return obj


def test_create_raw_material_requires_material_type_and_uom(organization):
    client = _client_as("Manager/Admin", "mgr1")

    response = client.post(
        "/api/v1/items/",
        {"code": "RM-1", "name": "Raw Areca Leaf", "item_class": "RAW_MATERIAL"},
        format="json",
    )

    assert response.status_code == 400
    body = response.json()
    assert "material_type" in body
    assert "inventory_uom" in body


def test_create_raw_material_succeeds_and_hides_product_type(organization):
    material_type = _material_type(organization)
    uom = _uom(organization)
    product_type = _product_type(organization)
    client = _client_as("Manager/Admin", "mgr2")

    response = client.post(
        "/api/v1/items/",
        {
            "code": "RM-2",
            "name": "Raw Areca Leaf",
            "item_class": "RAW_MATERIAL",
            "material_type": material_type.id,
            "inventory_uom": uom.id,
            "product_type": product_type.id,  # sent anyway — must be silently cleared
        },
        format="json",
    )

    assert response.status_code == 201
    item = Item.objects.get(code="RM-2")
    assert item.product_type_id is None


def test_create_finished_good_requires_product_and_material_type(organization):
    uom = _uom(organization)
    client = _client_as("Manager/Admin", "mgr3")

    response = client.post(
        "/api/v1/items/",
        {
            "code": "FG-1",
            "name": "10 in Plate",
            "item_class": "FINISHED_GOOD",
            "inventory_uom": uom.id,
        },
        format="json",
    )

    assert response.status_code == 400
    body = response.json()
    assert "product_type" in body
    assert "material_type" in body


def test_create_finished_good_succeeds(organization):
    product_type = _product_type(organization)
    material_type = _material_type(organization)
    uom = _uom(organization)
    client = _client_as("Manager/Admin", "mgr4")

    response = client.post(
        "/api/v1/items/",
        {
            "code": "FG-2",
            "name": "10 in Plate",
            "item_class": "FINISHED_GOOD",
            "product_type": product_type.id,
            "material_type": material_type.id,
            "inventory_uom": uom.id,
            "sellable": True,
            "stockable": True,
        },
        format="json",
    )

    assert response.status_code == 201
    item = Item.objects.get(code="FG-2")
    assert item.sellable is True
    assert item.organization_id is not None


def test_create_consumable_only_requires_uom(organization):
    uom = _uom(organization)
    client = _client_as("Manager/Admin", "mgr5")

    response = client.post(
        "/api/v1/items/",
        {
            "code": "CON-1",
            "name": "Machine Oil",
            "item_class": "CONSUMABLE",
            "inventory_uom": uom.id,
        },
        format="json",
    )

    assert response.status_code == 201


def test_create_rejects_duplicate_code(organization):
    uom = _uom(organization)
    Item.objects.create(
        code="DUP-1",
        name="First",
        item_class="CONSUMABLE",
        inventory_uom=uom,
        organization=organization,
    )
    client = _client_as("Manager/Admin", "mgr6")

    response = client.post(
        "/api/v1/items/",
        {"code": "DUP-1", "name": "Second", "item_class": "CONSUMABLE", "inventory_uom": uom.id},
        format="json",
    )

    assert response.status_code == 400


def test_filter_by_item_class(organization):
    uom = _uom(organization)
    Item.objects.create(
        code="CON-2",
        name="Grease",
        item_class="CONSUMABLE",
        inventory_uom=uom,
        organization=organization,
    )
    Item.objects.create(
        code="SCRAP-1",
        name="Offcuts",
        item_class="SCRAP_BY_PRODUCT",
        inventory_uom=uom,
        organization=organization,
    )
    client = _client_as("Export Coordinator", "coord2")

    response = client.get("/api/v1/items/?item_class=CONSUMABLE")

    codes = [i["code"] for i in response.json()["results"]]
    assert codes == ["CON-2"]


def test_filter_by_capability(organization):
    product_type = _product_type(organization)
    material_type = _material_type(organization)
    uom = _uom(organization)
    Item.objects.create(
        code="FG-3",
        name="Sellable Plate",
        item_class="FINISHED_GOOD",
        product_type=product_type,
        material_type=material_type,
        inventory_uom=uom,
        sellable=True,
        organization=organization,
    )
    Item.objects.create(
        code="RM-3",
        name="Raw Only",
        item_class="RAW_MATERIAL",
        material_type=material_type,
        inventory_uom=uom,
        sellable=False,
        organization=organization,
    )
    client = _client_as("Export Coordinator", "coord3")

    response = client.get("/api/v1/items/?capability=sellable")

    codes = [i["code"] for i in response.json()["results"]]
    assert codes == ["FG-3"]


def test_delete_unused_item_succeeds(organization):
    uom = _uom(organization)
    item = Item.objects.create(
        code="CON-3",
        name="Spare",
        item_class="CONSUMABLE",
        inventory_uom=uom,
        organization=organization,
    )
    client = _client_as("Manager/Admin", "mgr7")

    response = client.delete(f"/api/v1/items/{item.id}/")

    assert response.status_code == 204
    assert not Item.objects.filter(id=item.id).exists()
