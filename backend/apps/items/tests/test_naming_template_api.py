import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework.test import APIClient

from apps.items.models import Item, NamingTemplate, ProductType, Shape

pytestmark = pytest.mark.django_db

User = get_user_model()


def _client_as(role_name: str, username: str) -> APIClient:
    client = APIClient()
    user = User.objects.create_user(username=username, password="x")
    user.groups.add(Group.objects.get(name=role_name))
    client.force_authenticate(user=user)
    return client


def test_create_class_wide_template(organization):
    client = _client_as("Manager/Admin", "mgr1")

    response = client.post(
        "/api/v1/naming-templates/",
        {
            "item_class": Item.ItemClass.FINISHED_GOOD,
            "name_pattern": "{dimension} {product_type} — {material_type}",
            "code_pattern": "{material_type_short}_{shape_short}{product_type_short}-{dimension}",
        },
        format="json",
    )

    assert response.status_code == 201
    assert NamingTemplate.objects.filter(
        item_class=Item.ItemClass.FINISHED_GOOD, product_type__isnull=True
    ).exists()


def test_create_product_type_scoped_template(organization):
    plate = ProductType.objects.create(name="Plate", short_code="PL", organization=organization)
    client = _client_as("Manager/Admin", "mgr2")

    response = client.post(
        "/api/v1/naming-templates/",
        {
            "item_class": Item.ItemClass.FINISHED_GOOD,
            "product_type": plate.id,
            "name_pattern": "{dimension} {product_type}",
            "code_pattern": "{dimension}",
        },
        format="json",
    )

    assert response.status_code == 201
    assert response.json()["product_type_name"] == "Plate"


def test_duplicate_scope_is_rejected(organization):
    NamingTemplate.objects.create(
        item_class=Item.ItemClass.RAW_MATERIAL,
        name_pattern="{material_type}",
        organization=organization,
    )
    client = _client_as("Manager/Admin", "mgr3")

    response = client.post(
        "/api/v1/naming-templates/",
        {"item_class": Item.ItemClass.RAW_MATERIAL, "name_pattern": "{material_type} — raw"},
        format="json",
    )

    assert response.status_code == 400


def test_list_filters_by_item_class(organization):
    NamingTemplate.objects.create(
        item_class=Item.ItemClass.FINISHED_GOOD,
        name_pattern="a",
        organization=organization,
    )
    NamingTemplate.objects.create(
        item_class=Item.ItemClass.RAW_MATERIAL,
        name_pattern="b",
        organization=organization,
    )
    client = _client_as("Export Coordinator", "coord1")

    response = client.get("/api/v1/naming-templates/", {"item_class": Item.ItemClass.FINISHED_GOOD})

    results = response.json()["results"]
    assert response.status_code == 200
    assert len(results) == 1
    assert results[0]["item_class"] == Item.ItemClass.FINISHED_GOOD


def test_create_shape_scoped_template(organization):
    round_shape = Shape.objects.create(name="Round-A", short_code="RD", organization=organization)
    client = _client_as("Manager/Admin", "mgr5")

    response = client.post(
        "/api/v1/naming-templates/",
        {
            "item_class": Item.ItemClass.WIP,
            "shape": round_shape.id,
            "name_pattern": "{dimension}",
            "code_pattern": "{dimension}",
        },
        format="json",
    )

    assert response.status_code == 201
    assert response.json()["shape_name"] == "Round-A"


def test_duplicate_shape_and_product_type_scope_is_rejected(organization):
    plate = ProductType.objects.create(name="Plate-A", organization=organization)
    round_shape = Shape.objects.create(name="Round-B", organization=organization)
    NamingTemplate.objects.create(
        item_class=Item.ItemClass.FINISHED_GOOD,
        product_type=plate,
        shape=round_shape,
        name_pattern="a",
        organization=organization,
    )
    client = _client_as("Manager/Admin", "mgr6")

    response = client.post(
        "/api/v1/naming-templates/",
        {
            "item_class": Item.ItemClass.FINISHED_GOOD,
            "product_type": plate.id,
            "shape": round_shape.id,
            "name_pattern": "b",
        },
        format="json",
    )

    assert response.status_code == 400


def test_same_product_type_different_shape_is_allowed(organization):
    plate = ProductType.objects.create(name="Plate-C", organization=organization)
    round_shape = Shape.objects.create(name="Round-C", organization=organization)
    square_shape = Shape.objects.create(name="Square-C", organization=organization)
    NamingTemplate.objects.create(
        item_class=Item.ItemClass.FINISHED_GOOD,
        product_type=plate,
        shape=round_shape,
        name_pattern="a",
        organization=organization,
    )
    client = _client_as("Manager/Admin", "mgr7")

    response = client.post(
        "/api/v1/naming-templates/",
        {
            "item_class": Item.ItemClass.FINISHED_GOOD,
            "product_type": plate.id,
            "shape": square_shape.id,
            "name_pattern": "b",
        },
        format="json",
    )

    assert response.status_code == 201


def test_product_type_scope_is_cleared_for_a_class_that_hides_it(organization):
    plate = ProductType.objects.create(name="Plate-D", organization=organization)
    client = _client_as("Manager/Admin", "mgr8")

    response = client.post(
        "/api/v1/naming-templates/",
        {
            "item_class": Item.ItemClass.RAW_MATERIAL,
            "product_type": plate.id,  # sent anyway — must be silently cleared
            "name_pattern": "{material_type}",
        },
        format="json",
    )

    assert response.status_code == 201
    assert response.json()["product_type"] is None


def test_product_type_scope_is_kept_for_packaging_material(organization):
    carton = ProductType.objects.create(name="Carton-D", organization=organization)
    client = _client_as("Manager/Admin", "mgr9")

    response = client.post(
        "/api/v1/naming-templates/",
        {
            "item_class": Item.ItemClass.PACKAGING_MATERIAL,
            "product_type": carton.id,
            "name_pattern": "{material_type} {product_type}",
        },
        format="json",
    )

    assert response.status_code == 201
    assert response.json()["product_type"] == carton.id


def test_deactivate_and_delete_template(organization):
    template = NamingTemplate.objects.create(
        item_class=Item.ItemClass.CONSUMABLE,
        name_pattern="{material_type}",
        organization=organization,
    )
    client = _client_as("Manager/Admin", "mgr4")

    patch_response = client.patch(
        f"/api/v1/naming-templates/{template.id}/", {"is_active": False}, format="json"
    )
    delete_response = client.delete(f"/api/v1/naming-templates/{template.id}/")

    assert patch_response.status_code == 200
    assert delete_response.status_code == 204
    assert not NamingTemplate.objects.filter(id=template.id).exists()
