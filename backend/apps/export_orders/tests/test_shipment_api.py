import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework.test import APIClient

from apps.customers.models import Customer
from apps.export_orders.models import (
    ExportOrder,
    ExportOrderLine,
    PackingTransaction,
    Shipment,
    ShipmentLine,
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


@pytest.fixture
def customer(organization):
    return Customer.objects.create(
        code="CUST-1", name="Acme Exports", organization=organization
    )


@pytest.fixture
def order(customer):
    return ExportOrder.objects.create(
        order_number="EO-2026-0001",
        customer=customer,
        customer_po_number="PO-1",
        customer_po_date="2026-01-01",
    )


@pytest.fixture
def line(order):
    return ExportOrderLine.objects.create(
        export_order=order,
        line_number=1,
        customer_sku_code="SKU-A",
        original_customer_quantity=1_000,
        original_customer_unit=ExportOrderLine.Unit.PIECE,
    )


@pytest.fixture
def other_order(customer):
    return ExportOrder.objects.create(
        order_number="EO-2026-0002",
        customer=customer,
        customer_po_number="PO-2",
        customer_po_date="2026-01-01",
    )


@pytest.fixture
def other_order_line(other_order):
    return ExportOrderLine.objects.create(
        export_order=other_order,
        line_number=1,
        customer_sku_code="SKU-B",
        original_customer_quantity=500,
        original_customer_unit=ExportOrderLine.Unit.PIECE,
    )


@pytest.fixture
def product(organization):
    return Product.objects.create(
        sku_code="SKU-1", name="Areca Plate", base_unit="Piece", organization=organization
    )


@pytest.fixture
def cartonized_line(order, product):
    # pieces_per_carton = 10 * 10 = 100; 1,000 pieces -> required_cartons = 10
    return ExportOrderLine.objects.create(
        export_order=order,
        line_number=1,
        customer_sku_code="SKU-A",
        product=product,
        original_customer_quantity=1_000,
        original_customer_unit=ExportOrderLine.Unit.PIECE,
        pieces_per_pouch=10,
        pouches_per_carton=10,
    )


def _shipments_url(order: ExportOrder) -> str:
    return f"/api/v1/export-orders/{order.id}/shipments/"


def _shipment_detail_url(order: ExportOrder, shipment: Shipment) -> str:
    return f"/api/v1/export-orders/{order.id}/shipments/{shipment.id}/"


def _lines_url(order: ExportOrder, shipment: Shipment) -> str:
    return f"/api/v1/export-orders/{order.id}/shipments/{shipment.id}/lines/"


def _line_detail_url(order: ExportOrder, shipment: Shipment, shipment_line_id: int) -> str:
    return f"/api/v1/export-orders/{order.id}/shipments/{shipment.id}/lines/{shipment_line_id}/"


def _loading_transactions_url(order: ExportOrder, shipment: Shipment, shipment_line_id: int) -> str:
    return (
        f"/api/v1/export-orders/{order.id}/shipments/{shipment.id}/lines/"
        f"{shipment_line_id}/loading-transactions/"
    )


def _loading_transaction_detail_url(
    order: ExportOrder, shipment: Shipment, shipment_line_id: int, transaction_id: int
) -> str:
    return (
        f"/api/v1/export-orders/{order.id}/shipments/{shipment.id}/lines/"
        f"{shipment_line_id}/loading-transactions/{transaction_id}/"
    )


def test_create_shipment_generates_number(order):
    client = _client_as("Export Coordinator", "coord1")

    response = client.post(
        _shipments_url(order),
        {"planned_container_type": "40ft HC", "planned_ready_date": "2026-02-01"},
        format="json",
    )

    assert response.status_code == 201, response.json()
    assert response.json()["shipment_number"] == "EO-2026-0001-S01"
    assert response.json()["container_number"] == ""
    assert response.json()["status"] == "PLANNING"


def test_shipment_numbering_scoped_per_order(order, other_order):
    client = _client_as("Export Coordinator", "coord2")

    first = client.post(_shipments_url(order), {}, format="json")
    second = client.post(_shipments_url(order), {}, format="json")
    other = client.post(_shipments_url(other_order), {}, format="json")

    assert first.json()["shipment_number"] == "EO-2026-0001-S01"
    assert second.json()["shipment_number"] == "EO-2026-0001-S02"
    assert other.json()["shipment_number"] == "EO-2026-0002-S01"


def test_list_shipments(order):
    Shipment.objects.create(shipment_number="EO-2026-0001-S01", export_order=order)
    client = _client_as("Export Coordinator", "coord3")

    response = client.get(_shipments_url(order))

    assert response.status_code == 200
    assert len(response.json()) == 1


def test_patch_assigns_container_number_later(order):
    shipment = Shipment.objects.create(shipment_number="EO-2026-0001-S01", export_order=order)
    client = _client_as("Export Coordinator", "coord4")

    response = client.patch(
        _shipment_detail_url(order, shipment), {"container_number": "MSKU1234567"}, format="json"
    )

    assert response.status_code == 200
    assert response.json()["container_number"] == "MSKU1234567"


def test_delete_shipment(order):
    shipment = Shipment.objects.create(shipment_number="EO-2026-0001-S01", export_order=order)
    client = _client_as("Export Coordinator", "coord5")

    response = client.delete(_shipment_detail_url(order, shipment))

    assert response.status_code == 204
    assert not Shipment.objects.filter(pk=shipment.pk).exists()


def test_worked_example_split_sku_across_shipments(order, line):
    client = _client_as("Export Coordinator", "coord6")
    shipment_a = Shipment.objects.create(shipment_number="EO-2026-0001-S01", export_order=order)
    shipment_b = Shipment.objects.create(shipment_number="EO-2026-0001-S02", export_order=order)

    response_a = client.post(
        _lines_url(order, shipment_a),
        {"export_order_line": line.id, "planned_qty": 600},
        format="json",
    )
    response_b = client.post(
        _lines_url(order, shipment_b),
        {"export_order_line": line.id, "planned_qty": 400},
        format="json",
    )

    assert response_a.status_code == 201, response_a.json()
    assert response_b.status_code == 201, response_b.json()
    assert response_a.json()["planned_qty"] == 600
    assert response_b.json()["planned_qty"] == 400


def test_over_allocation_rejected(order, line):
    client = _client_as("Export Coordinator", "coord7")
    shipment_a = Shipment.objects.create(shipment_number="EO-2026-0001-S01", export_order=order)
    shipment_b = Shipment.objects.create(shipment_number="EO-2026-0001-S02", export_order=order)
    client.post(
        _lines_url(order, shipment_a),
        {"export_order_line": line.id, "planned_qty": 600},
        format="json",
    )

    response = client.post(
        _lines_url(order, shipment_b),
        {"export_order_line": line.id, "planned_qty": 500},
        format="json",
    )

    assert response.status_code == 400
    assert "planned_qty" in response.json()
    assert not ShipmentLine.objects.filter(shipment=shipment_b).exists()


def test_patch_reducing_qty_frees_up_allocation_for_another_shipment(order, line):
    client = _client_as("Export Coordinator", "coord8")
    shipment_a = Shipment.objects.create(shipment_number="EO-2026-0001-S01", export_order=order)
    shipment_b = Shipment.objects.create(shipment_number="EO-2026-0001-S02", export_order=order)
    create_response = client.post(
        _lines_url(order, shipment_a),
        {"export_order_line": line.id, "planned_qty": 600},
        format="json",
    )
    line_a_id = create_response.json()["id"]

    reduce_response = client.patch(
        _line_detail_url(order, shipment_a, line_a_id), {"planned_qty": 400}, format="json"
    )
    add_response = client.post(
        _lines_url(order, shipment_b),
        {"export_order_line": line.id, "planned_qty": 600},
        format="json",
    )

    assert reduce_response.status_code == 200
    assert add_response.status_code == 201, add_response.json()


def test_cross_order_line_rejected(order, other_order_line):
    """Structural guarantee for business-rules.md §7's 'one container = one
    customer': a shipment can never accept a line from a different order
    (and therefore a different customer).
    """
    client = _client_as("Export Coordinator", "coord9")
    shipment = Shipment.objects.create(shipment_number="EO-2026-0001-S01", export_order=order)

    response = client.post(
        _lines_url(order, shipment),
        {"export_order_line": other_order_line.id, "planned_qty": 100},
        format="json",
    )

    assert response.status_code == 400
    assert "export_order_line" in response.json()
    assert not ShipmentLine.objects.filter(shipment=shipment).exists()


def test_delete_shipment_line(order, line):
    client = _client_as("Export Coordinator", "coord10")
    shipment = Shipment.objects.create(shipment_number="EO-2026-0001-S01", export_order=order)
    create_response = client.post(
        _lines_url(order, shipment),
        {"export_order_line": line.id, "planned_qty": 100},
        format="json",
    )
    line_id = create_response.json()["id"]

    response = client.delete(_line_detail_url(order, shipment, line_id))

    assert response.status_code == 204
    assert not ShipmentLine.objects.filter(pk=line_id).exists()


def test_planned_cartons_derived_from_packing_config(order):
    cartonized_line = ExportOrderLine.objects.create(
        export_order=order,
        line_number=2,
        customer_sku_code="SKU-C",
        original_customer_quantity=1_000,
        original_customer_unit=ExportOrderLine.Unit.PIECE,
        pieces_per_pouch=10,
        pouches_per_carton=5,
    )
    client = _client_as("Export Coordinator", "coord11")
    shipment = Shipment.objects.create(shipment_number="EO-2026-0001-S01", export_order=order)

    response = client.post(
        _lines_url(order, shipment),
        {"export_order_line": cartonized_line.id, "planned_qty": 500},
        format="json",
    )

    assert response.status_code == 201, response.json()
    assert response.json()["planned_cartons"] == 10


def test_reason_required_when_actual_differs_from_planned(order, cartonized_line):
    client = _client_as("Export Coordinator", "coord12")
    shipment = Shipment.objects.create(shipment_number="EO-2026-0001-S01", export_order=order)
    create_response = client.post(
        _lines_url(order, shipment),
        {"export_order_line": cartonized_line.id, "planned_qty": 500},
        format="json",
    )
    line_id = create_response.json()["id"]

    response = client.post(
        _loading_transactions_url(order, shipment, line_id),
        {"date": "2026-01-06", "entry_type": "CARTON_LOADED", "cartons_loaded": 3},
        format="json",
    )

    assert response.status_code == 400
    assert "variance_reason" in response.json()


def test_reason_accepted_with_valid_choice(order, cartonized_line):
    client = _client_as("Export Coordinator", "coord13")
    shipment = Shipment.objects.create(shipment_number="EO-2026-0001-S01", export_order=order)
    create_response = client.post(
        _lines_url(order, shipment),
        {"export_order_line": cartonized_line.id, "planned_qty": 500},
        format="json",
    )
    line_id = create_response.json()["id"]

    response = client.post(
        _loading_transactions_url(order, shipment, line_id),
        {
            "date": "2026-01-06",
            "entry_type": "CARTON_LOADED",
            "cartons_loaded": 3,
            "variance_reason": "PACKING_SHORTAGE",
        },
        format="json",
    )

    assert response.status_code == 201, response.json()
    line_response = client.get(_line_detail_url(order, shipment, line_id))
    assert line_response.json()["loading_status"] == "SHORT_LOADED"
    assert line_response.json()["difference_cartons"] == -2
    assert line_response.json()["actual_loaded_qty"] == 300


def test_exact_match_needs_no_reason(order, cartonized_line):
    client = _client_as("Export Coordinator", "coord14")
    shipment = Shipment.objects.create(shipment_number="EO-2026-0001-S01", export_order=order)
    create_response = client.post(
        _lines_url(order, shipment),
        {"export_order_line": cartonized_line.id, "planned_qty": 500},
        format="json",
    )
    line_id = create_response.json()["id"]

    response = client.post(
        _loading_transactions_url(order, shipment, line_id),
        {"date": "2026-01-06", "entry_type": "CARTON_LOADED", "cartons_loaded": 5},
        format="json",
    )

    assert response.status_code == 201, response.json()
    line_response = client.get(_line_detail_url(order, shipment, line_id))
    assert line_response.json()["loading_status"] == "EXACT"


def test_stock_return_credits_available_qty_after_loading(order, cartonized_line, product):
    PackingTransaction.objects.create(
        export_order_line=cartonized_line,
        date="2026-01-05",
        entry_type=PackingTransaction.EntryType.CARTON_COMPLETED,
        cartons_packed=10,
    )
    client = _client_as("Export Coordinator", "coord15")
    shipment = Shipment.objects.create(shipment_number="EO-2026-0001-S01", export_order=order)
    create_response = client.post(
        _lines_url(order, shipment),
        {"export_order_line": cartonized_line.id, "planned_qty": 1_000},
        format="json",
    )
    line_id = create_response.json()["id"]

    response = client.post(
        _loading_transactions_url(order, shipment, line_id),
        {
            "date": "2026-01-06",
            "entry_type": "CARTON_LOADED",
            "cartons_loaded": 8,
            "variance_reason": "PACKING_SHORTAGE",
        },
        format="json",
    )

    assert response.status_code == 201, response.json()
    product.refresh_from_db()
    assert product.available_qty == 2  # packed 10 - loaded 8


def test_stock_return_correction_applies_only_the_delta(order, cartonized_line, product):
    PackingTransaction.objects.create(
        export_order_line=cartonized_line,
        date="2026-01-05",
        entry_type=PackingTransaction.EntryType.CARTON_COMPLETED,
        cartons_packed=10,
    )
    client = _client_as("Export Coordinator", "coord16")
    shipment = Shipment.objects.create(shipment_number="EO-2026-0001-S01", export_order=order)
    create_response = client.post(
        _lines_url(order, shipment),
        {"export_order_line": cartonized_line.id, "planned_qty": 1_000},
        format="json",
    )
    line_id = create_response.json()["id"]
    transaction_response = client.post(
        _loading_transactions_url(order, shipment, line_id),
        {
            "date": "2026-01-06",
            "entry_type": "CARTON_LOADED",
            "cartons_loaded": 8,
            "variance_reason": "PACKING_SHORTAGE",
        },
        format="json",
    )
    transaction_id = transaction_response.json()["id"]

    # A correction to the same entry, not a second one — matches the
    # single-snapshot semantics this test originally verified.
    client.patch(
        _loading_transaction_detail_url(order, shipment, line_id, transaction_id),
        {"cartons_loaded": 9},
        format="json",
    )

    product.refresh_from_db()
    assert product.available_qty == 1  # not 2 + 1 = 3


def test_stock_return_split_across_shipments_no_double_credit(order, cartonized_line, product):
    PackingTransaction.objects.create(
        export_order_line=cartonized_line,
        date="2026-01-05",
        entry_type=PackingTransaction.EntryType.CARTON_COMPLETED,
        cartons_packed=10,
    )
    client = _client_as("Export Coordinator", "coord17")
    shipment_a = Shipment.objects.create(shipment_number="EO-2026-0001-S01", export_order=order)
    shipment_b = Shipment.objects.create(shipment_number="EO-2026-0001-S02", export_order=order)
    line_a = client.post(
        _lines_url(order, shipment_a),
        {"export_order_line": cartonized_line.id, "planned_qty": 500},
        format="json",
    ).json()
    line_b = client.post(
        _lines_url(order, shipment_b),
        {"export_order_line": cartonized_line.id, "planned_qty": 500},
        format="json",
    ).json()

    client.post(
        _loading_transactions_url(order, shipment_a, line_a["id"]),
        {
            "date": "2026-01-06",
            "entry_type": "CARTON_LOADED",
            "cartons_loaded": 4,
            "variance_reason": "PACKING_SHORTAGE",
        },
        format="json",
    )
    client.post(
        _loading_transactions_url(order, shipment_b, line_b["id"]),
        {
            "date": "2026-01-06",
            "entry_type": "CARTON_LOADED",
            "cartons_loaded": 4,
            "variance_reason": "PACKING_SHORTAGE",
        },
        format="json",
    )

    product.refresh_from_db()
    assert product.available_qty == 2  # packed 10 - (4 + 4) loaded = 2, not 2 + 2
