import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework.test import APIClient

from apps.items.models import UOM, Item, ItemFieldRule, MaterialType, ProductType

pytestmark = pytest.mark.django_db

User = get_user_model()


def _client_as(role_name: str, username: str) -> APIClient:
    client = APIClient()
    user = User.objects.create_user(username=username, password="x")
    user.groups.add(Group.objects.get(name=role_name))
    client.force_authenticate(user=user)
    return client


def test_list_returns_all_seeded_rules(organization):
    client = _client_as("Export Coordinator", "coord1")

    response = client.get("/api/v1/item-field-rules/")

    assert response.status_code == 200
    assert len(response.json()) == 24


def test_update_rule_state(organization):
    rule = ItemFieldRule.objects.get(
        item_class=Item.ItemClass.CONSUMABLE, field=ItemFieldRule.Field.PRODUCT_TYPE
    )
    assert rule.state == ItemFieldRule.State.OPTIONAL
    client = _client_as("Manager/Admin", "mgr1")

    response = client.patch(
        f"/api/v1/item-field-rules/{rule.id}/", {"state": "REQUIRED"}, format="json"
    )

    assert response.status_code == 200
    rule.refresh_from_db()
    assert rule.state == ItemFieldRule.State.REQUIRED


def test_updated_rule_is_enforced_on_item_create(organization):
    rule = ItemFieldRule.objects.get(
        item_class=Item.ItemClass.CONSUMABLE, field=ItemFieldRule.Field.PRODUCT_TYPE
    )
    rule.state = ItemFieldRule.State.REQUIRED
    rule.save()
    uom = UOM.objects.create(code="PC3", name="Piece3", organization=organization)
    client = _client_as("Manager/Admin", "mgr2")

    response = client.post(
        "/api/v1/items/",
        {"code": "CON-4", "name": "Tape", "item_class": "CONSUMABLE", "inventory_uom": uom.id},
        format="json",
    )

    assert response.status_code == 400
    assert "product_type" in response.json()


def test_hidden_rule_is_enforced_on_item_create(organization):
    rule = ItemFieldRule.objects.get(
        item_class=Item.ItemClass.SCRAP_BY_PRODUCT, field=ItemFieldRule.Field.MATERIAL_TYPE
    )
    rule.state = ItemFieldRule.State.HIDDEN
    rule.save()
    material_type = MaterialType.objects.create(name="Offcut Wood", organization=organization)
    uom = UOM.objects.create(code="PC4", name="Piece4", organization=organization)
    client = _client_as("Manager/Admin", "mgr3")

    response = client.post(
        "/api/v1/items/",
        {
            "code": "SCR-2",
            "name": "Trimmings",
            "item_class": "SCRAP_BY_PRODUCT",
            "material_type": material_type.id,  # sent anyway — must be silently cleared
            "inventory_uom": uom.id,
        },
        format="json",
    )

    assert response.status_code == 201
    item = Item.objects.get(code="SCR-2")
    assert item.material_type_id is None


def test_shape_required_rule_is_enforced_on_item_create(organization):
    rule = ItemFieldRule.objects.get(
        item_class=Item.ItemClass.WIP, field=ItemFieldRule.Field.SHAPE
    )
    rule.state = ItemFieldRule.State.REQUIRED
    rule.save()
    material_type = MaterialType.objects.create(name="Test WIP Material", organization=organization)
    uom = UOM.objects.create(code="PC5", name="Piece5", organization=organization)
    client = _client_as("Manager/Admin", "mgr5")

    response = client.post(
        "/api/v1/items/",
        {
            "code": "WIP-1",
            "name": "Pressed Blank",
            "item_class": "WIP",
            "material_type": material_type.id,
            "inventory_uom": uom.id,
        },
        format="json",
    )

    assert response.status_code == 400
    assert "shape" in response.json()


def test_dimensions_required_rule_enforces_length_and_height_not_breadth(organization):
    rule = ItemFieldRule.objects.get(
        item_class=Item.ItemClass.WIP, field=ItemFieldRule.Field.DIMENSIONS
    )
    rule.state = ItemFieldRule.State.REQUIRED
    rule.save()
    product_type = ProductType.objects.create(name="Test WIP Type", organization=organization)
    material_type = MaterialType.objects.create(
        name="Test WIP Material 2", organization=organization
    )
    uom = UOM.objects.create(code="PC6", name="Piece6", organization=organization)
    client = _client_as("Manager/Admin", "mgr6")

    missing_response = client.post(
        "/api/v1/items/",
        {
            "code": "WIP-2",
            "name": "Round Blank",
            "item_class": "WIP",
            "product_type": product_type.id,
            "material_type": material_type.id,
            "inventory_uom": uom.id,
        },
        format="json",
    )

    assert missing_response.status_code == 400
    body = missing_response.json()
    assert "length_in" in body
    assert "height_mm" in body
    assert "breadth_in" not in body

    # Length + height alone (no breadth) is enough — a round item has none.
    success_response = client.post(
        "/api/v1/items/",
        {
            "code": "WIP-3",
            "name": "Round Blank",
            "item_class": "WIP",
            "product_type": product_type.id,
            "material_type": material_type.id,
            "inventory_uom": uom.id,
            "length_in": "10.00",
            "height_mm": "20.00",
        },
        format="json",
    )

    assert success_response.status_code == 201


def test_item_class_and_field_are_read_only(organization):
    rule = ItemFieldRule.objects.filter(item_class=Item.ItemClass.WIP).first()
    client = _client_as("Manager/Admin", "mgr4")

    response = client.patch(
        f"/api/v1/item-field-rules/{rule.id}/",
        {"item_class": "SCRAP_BY_PRODUCT", "field": "shape", "state": "HIDDEN"},
        format="json",
    )

    assert response.status_code == 200
    rule.refresh_from_db()
    assert rule.item_class == Item.ItemClass.WIP
    assert rule.state == ItemFieldRule.State.HIDDEN


def test_update_requires_manage_permission(organization):
    rule = ItemFieldRule.objects.filter(item_class=Item.ItemClass.WIP).first()
    client = _client_as("Production Coordinator", "prod1")

    response = client.patch(
        f"/api/v1/item-field-rules/{rule.id}/", {"state": "HIDDEN"}, format="json"
    )

    assert response.status_code == 403
