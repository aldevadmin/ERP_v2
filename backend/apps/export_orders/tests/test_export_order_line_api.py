import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework.test import APIClient

from apps.customer_mappings.models import CustomerProductMapping, CustomerProductMappingVersion
from apps.customers.models import Customer
from apps.export_orders.models import ExportOrder, ExportOrderLine
from apps.items.models import Item
from apps.packaging.models import PackagingProfile, PackagingProfileVersion

pytestmark = pytest.mark.django_db

User = get_user_model()


def _mapping(
    customer: Customer,
    item: Item,
    customer_sku_code: str = "CUST-SKU-1",
    pieces_per_pouch: int | None = None,
    pouches_per_carton: int | None = None,
) -> PackagingProfileVersion:
    """Sets up a published Customer Product Mapping (and its pinned,
    published packaging profile version) resolvable via
    `customer_mappings.resolve_customer_product(customer, item)` — the
    same resolution path `ExportOrderLineSerializer` uses to snapshot
    packing config. Returns the packaging profile version so tests can
    still mutate `pieces_per_pouch` directly (bypassing the API, same as
    editing master data after a line already snapshotted it) to assert the
    snapshot doesn't drift.
    """
    profile = PackagingProfile.objects.create(
        code=f"PKG-{customer.id}-{item.id}-{customer_sku_code}",
        name=f"{item.name} — {customer.name}",
        finished_item=item,
        organization=item.organization,
    )
    profile_version = PackagingProfileVersion.objects.create(
        profile=profile,
        version_number=1,
        status=PackagingProfileVersion.Status.PUBLISHED,
        pieces_per_pouch=pieces_per_pouch,
        pouches_per_carton=pouches_per_carton,
        organization=item.organization,
    )
    mapping = CustomerProductMapping.objects.create(
        customer=customer,
        item=item,
        customer_sku=customer_sku_code,
        mapping_code=f"CPM-{customer.id}-{item.id}-{customer_sku_code}",
        organization=item.organization,
    )
    CustomerProductMappingVersion.objects.create(
        mapping=mapping,
        version_number=1,
        status=CustomerProductMappingVersion.Status.PUBLISHED,
        packaging_profile_version=profile_version,
        organization=item.organization,
    )
    return profile_version


def _client_as(role_name: str, username: str) -> APIClient:
    client = APIClient()
    user = User.objects.create_user(username=username, password="x")
    user.groups.add(Group.objects.get(name=role_name))
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def customer(organization):
    return Customer.objects.create(code="CUST-1", name="Acme Exports", organization=organization)


@pytest.fixture
def other_customer(organization):
    return Customer.objects.create(code="CUST-2", name="Other Co", organization=organization)


@pytest.fixture
def order(customer):
    return ExportOrder.objects.create(
        order_number="EO-2026-0001",
        customer=customer,
        customer_po_number="PO-1",
        customer_po_date="2026-01-01",
    )


@pytest.fixture
def product(organization):
    return Item.objects.create(
        code="SKU-1",
        name="Areca Plate",
        item_class=Item.ItemClass.FINISHED_GOOD,
        organization=organization,
    )


def _lines_url(order: ExportOrder) -> str:
    return f"/api/v1/export-orders/{order.id}/lines/"


def _line_detail_url(order: ExportOrder, line_id: int) -> str:
    return f"/api/v1/export-orders/{order.id}/lines/{line_id}/"


def test_create_piece_line_without_product(order):
    client = _client_as("Export Coordinator", "coord1")

    response = client.post(
        _lines_url(order),
        {
            "customer_sku_code": "CUST-SKU-1",
            "customer_description": "10 Inch Plate",
            "original_customer_quantity": 100,
            "original_customer_unit": "PIECE",
        },
        format="json",
    )

    assert response.status_code == 201
    body = response.json()
    assert body["line_number"] == 1
    assert body["required_pieces"] == 100
    assert body["required_pouches"] is None
    assert body["required_cartons"] is None
    assert body["item"] is None


def test_create_pouch_line_without_resolvable_mapping_is_rejected(order, product):
    client = _client_as("Export Coordinator", "coord2")

    response = client.post(
        _lines_url(order),
        {
            "customer_sku_code": "CUST-SKU-1",
            "item": product.id,
            "original_customer_quantity": 10,
            "original_customer_unit": "POUCH",
        },
        format="json",
    )

    assert response.status_code == 400
    assert "item" in response.json()


def test_create_pouch_line_missing_pieces_per_pouch_is_rejected(order, product, customer):
    _mapping(customer, product)
    client = _client_as("Export Coordinator", "coord3")

    response = client.post(
        _lines_url(order),
        {
            "customer_sku_code": "CUST-SKU-1",
            "item": product.id,
            "original_customer_quantity": 10,
            "original_customer_unit": "POUCH",
        },
        format="json",
    )

    assert response.status_code == 400
    assert "item" in response.json()


def test_create_carton_line_missing_pouches_per_carton_is_rejected(order, product, customer):
    _mapping(customer, product, pieces_per_pouch=10)
    client = _client_as("Export Coordinator", "coord4")

    response = client.post(
        _lines_url(order),
        {
            "customer_sku_code": "CUST-SKU-1",
            "item": product.id,
            "original_customer_quantity": 3,
            "original_customer_unit": "CARTON",
        },
        format="json",
    )

    assert response.status_code == 400
    assert "item" in response.json()


def test_create_carton_line_resolves_and_snapshots_packing_config(order, product, customer):
    _mapping(customer, product, pieces_per_pouch=10, pouches_per_carton=3)
    client = _client_as("Export Coordinator", "coord5")

    response = client.post(
        _lines_url(order),
        {
            "customer_sku_code": "CUST-SKU-1",
            "item": product.id,
            "original_customer_quantity": 105,
            "original_customer_unit": "PIECE",
        },
        format="json",
    )

    assert response.status_code == 201
    body = response.json()
    assert body["pieces_per_pouch"] == 10
    assert body["pouches_per_carton"] == 3
    assert body["pieces_per_carton"] == 30
    assert body["required_pieces"] == 105
    # 105 pieces -> 11 pouches (rounded up) -> 4 cartons (rounded up)
    assert body["required_pouches"] == 11
    assert body["required_cartons"] == 4
    assert body["item_code"] == "SKU-1"
    assert body["item_name"] == "Areca Plate"


def test_mapping_resolution_scoped_to_order_customer(order, product, other_customer):
    _mapping(other_customer, product, pieces_per_pouch=10)
    client = _client_as("Export Coordinator", "coord6")

    response = client.post(
        _lines_url(order),
        {
            "customer_sku_code": "CUST-SKU-1",
            "item": product.id,
            "original_customer_quantity": 10,
            "original_customer_unit": "POUCH",
        },
        format="json",
    )

    assert response.status_code == 400


def test_line_numbers_increment_within_order(order):
    client = _client_as("Export Coordinator", "coord7")
    payload = {
        "customer_sku_code": "CUST-SKU-1",
        "original_customer_quantity": 10,
        "original_customer_unit": "PIECE",
    }

    first = client.post(_lines_url(order), payload, format="json")
    second = client.post(_lines_url(order), payload, format="json")

    assert first.json()["line_number"] == 1
    assert second.json()["line_number"] == 2


def test_update_quantity_does_not_resnapshot_packing_config(order, product, customer):
    profile_version = _mapping(customer, product, pieces_per_pouch=10)
    client = _client_as("Export Coordinator", "coord8")
    create_response = client.post(
        _lines_url(order),
        {
            "customer_sku_code": "CUST-SKU-1",
            "item": product.id,
            "original_customer_quantity": 10,
            "original_customer_unit": "POUCH",
        },
        format="json",
    )
    line_id = create_response.json()["id"]

    profile_version.pieces_per_pouch = 999
    profile_version.save()

    response = client.patch(
        _line_detail_url(order, line_id), {"original_customer_quantity": 20}, format="json"
    )

    assert response.status_code == 200
    assert response.json()["pieces_per_pouch"] == 10


def test_update_product_change_resnapshots_packing_config(order, product, customer):
    _mapping(customer, product, pieces_per_pouch=10)
    other_product = Item.objects.create(
        code="SKU-2",
        name="Areca Bowl",
        item_class=Item.ItemClass.FINISHED_GOOD,
        organization=customer.organization,
    )
    _mapping(customer, other_product, customer_sku_code="CUST-SKU-2", pieces_per_pouch=25)
    client = _client_as("Export Coordinator", "coord9")
    create_response = client.post(
        _lines_url(order),
        {
            "customer_sku_code": "CUST-SKU-1",
            "item": product.id,
            "original_customer_quantity": 10,
            "original_customer_unit": "POUCH",
        },
        format="json",
    )
    line_id = create_response.json()["id"]

    response = client.patch(
        _line_detail_url(order, line_id),
        {"item": other_product.id, "customer_sku_code": "CUST-SKU-2"},
        format="json",
    )

    assert response.status_code == 200
    assert response.json()["pieces_per_pouch"] == 25


def test_update_product_cleared_clears_snapshot(order, product, customer):
    _mapping(customer, product, pieces_per_pouch=10)
    client = _client_as("Manager/Admin", "mgr1")
    create_response = client.post(
        _lines_url(order),
        {
            "customer_sku_code": "CUST-SKU-1",
            "item": product.id,
            "original_customer_quantity": 10,
            "original_customer_unit": "POUCH",
        },
        format="json",
    )
    line_id = create_response.json()["id"]

    response = client.patch(
        _line_detail_url(order, line_id),
        {"item": None, "original_customer_unit": "PIECE"},
        format="json",
    )

    assert response.status_code == 200
    assert response.json()["pieces_per_pouch"] is None


def test_delete_line(order):
    client = _client_as("Manager/Admin", "mgr2")
    create_response = client.post(
        _lines_url(order),
        {
            "customer_sku_code": "CUST-SKU-1",
            "original_customer_quantity": 10,
            "original_customer_unit": "PIECE",
        },
        format="json",
    )
    line_id = create_response.json()["id"]

    response = client.delete(_line_detail_url(order, line_id))

    assert response.status_code == 204
    assert not ExportOrderLine.objects.filter(id=line_id).exists()


def test_list_lines_scoped_to_order(customer, order):
    other_order = ExportOrder.objects.create(
        order_number="EO-2026-0002",
        customer=customer,
        customer_po_number="PO-2",
        customer_po_date="2026-01-01",
    )
    ExportOrderLine.objects.create(
        export_order=order,
        line_number=1,
        customer_sku_code="SKU-A",
        original_customer_quantity=10,
        original_customer_unit=ExportOrderLine.Unit.PIECE,
    )
    ExportOrderLine.objects.create(
        export_order=other_order,
        line_number=1,
        customer_sku_code="SKU-B",
        original_customer_quantity=5,
        original_customer_unit=ExportOrderLine.Unit.PIECE,
    )
    client = _client_as("Export Coordinator", "coord10")

    response = client.get(_lines_url(order))

    body = response.json()
    assert len(body) == 1
    assert body[0]["customer_sku_code"] == "SKU-A"


def test_list_lines_not_paginated(order):
    for i in range(25):
        ExportOrderLine.objects.create(
            export_order=order,
            line_number=i + 1,
            customer_sku_code=f"SKU-{i}",
            original_customer_quantity=10,
            original_customer_unit=ExportOrderLine.Unit.PIECE,
        )
    client = _client_as("Export Coordinator", "coord11")

    response = client.get(_lines_url(order))

    body = response.json()
    assert isinstance(body, list)
    assert len(body) == 25


def test_quantity_must_be_at_least_one(order):
    client = _client_as("Export Coordinator", "coord12")

    response = client.post(
        _lines_url(order),
        {
            "customer_sku_code": "CUST-SKU-1",
            "original_customer_quantity": 0,
            "original_customer_unit": "PIECE",
        },
        format="json",
    )

    assert response.status_code == 400
