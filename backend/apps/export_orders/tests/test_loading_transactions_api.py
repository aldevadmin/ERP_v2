import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework.test import APIClient

from apps.customers.models import Customer
from apps.export_orders.models import ExportOrder, ExportOrderLine, Shipment, ShipmentLine

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
def line_a(order):
    # pieces_per_carton = 10 * 10 = 100
    return ExportOrderLine.objects.create(
        export_order=order,
        line_number=1,
        customer_sku_code="SKU-A",
        original_customer_quantity=1_000,
        original_customer_unit=ExportOrderLine.Unit.PIECE,
        pieces_per_pouch=10,
        pouches_per_carton=10,
    )


@pytest.fixture
def line_b(order):
    return ExportOrderLine.objects.create(
        export_order=order,
        line_number=2,
        customer_sku_code="SKU-B",
        original_customer_quantity=500,
        original_customer_unit=ExportOrderLine.Unit.PIECE,
        pieces_per_pouch=10,
        pouches_per_carton=10,
    )


@pytest.fixture
def shipment(order):
    return Shipment.objects.create(shipment_number="EO-2026-0001-S01", export_order=order)


@pytest.fixture
def shipment_line_a(shipment, line_a):
    return ShipmentLine.objects.create(
        shipment=shipment, export_order_line=line_a, planned_qty=1_000
    )


@pytest.fixture
def shipment_line_b(shipment, line_b):
    return ShipmentLine.objects.create(shipment=shipment, export_order_line=line_b, planned_qty=500)


def _transactions_url(order: ExportOrder, shipment: Shipment, line_id: int) -> str:
    return (
        f"/api/v1/export-orders/{order.id}/shipments/{shipment.id}/lines/{line_id}/"
        "loading-transactions/"
    )


def _log_url(order: ExportOrder, shipment: Shipment) -> str:
    return f"/api/v1/export-orders/{order.id}/shipments/{shipment.id}/loading-transactions/"


def test_post_carton_loaded_entry(order, shipment, shipment_line_a):
    # planned_cartons is 10 for this line — 5 loaded needs a reason too.
    client = _client_as("Export Coordinator", "coord1")

    response = client.post(
        _transactions_url(order, shipment, shipment_line_a.id),
        {
            "date": "2026-01-06",
            "entry_type": "CARTON_LOADED",
            "cartons_loaded": 5,
            "variance_reason": "PACKING_SHORTAGE",
        },
        format="json",
    )

    assert response.status_code == 201, response.json()
    assert response.json()["calculated_pieces"] == 500
    assert response.json()["entered_by"] == "coord1"


def test_post_pouch_loaded_entry(order, shipment, shipment_line_a):
    client = _client_as("Export Coordinator", "coord2")

    response = client.post(
        _transactions_url(order, shipment, shipment_line_a.id),
        {"date": "2026-01-06", "entry_type": "POUCH_LOADED", "pouches_loaded": 20},
        format="json",
    )

    assert response.status_code == 201, response.json()
    assert response.json()["calculated_pieces"] == 200


def test_post_rejected_when_cartons_missing_for_carton_loaded(order, shipment, shipment_line_a):
    client = _client_as("Export Coordinator", "coord3")

    response = client.post(
        _transactions_url(order, shipment, shipment_line_a.id),
        {"date": "2026-01-06", "entry_type": "CARTON_LOADED"},
        format="json",
    )

    assert response.status_code == 400
    assert "cartons_loaded" in response.json()


def test_post_rejected_when_pouches_set_for_carton_loaded(order, shipment, shipment_line_a):
    client = _client_as("Export Coordinator", "coord4")

    response = client.post(
        _transactions_url(order, shipment, shipment_line_a.id),
        {
            "date": "2026-01-06",
            "entry_type": "CARTON_LOADED",
            "cartons_loaded": 5,
            "pouches_loaded": 2,
        },
        format="json",
    )

    assert response.status_code == 400
    assert "pouches_loaded" in response.json()


def test_repeated_partial_entries_never_require_a_reason(order, shipment, shipment_line_a):
    """Loading is frequent real-time partial updates now (every 15-30
    minutes, eventually barcode-scan-driven), not a single end-of-day
    snapshot — every entry succeeds without a reason, whether or not the
    running total matches planned yet. Planned = 10 cartons.
    """
    client = _client_as("Export Coordinator", "coord5")
    first = client.post(
        _transactions_url(order, shipment, shipment_line_a.id),
        {"date": "2026-01-06", "entry_type": "CARTON_LOADED", "cartons_loaded": 9},
        format="json",
    )
    assert first.status_code == 201, first.json()

    second = client.post(
        _transactions_url(order, shipment, shipment_line_a.id),
        {"date": "2026-01-07", "entry_type": "CARTON_LOADED", "cartons_loaded": 2},
        format="json",
    )
    assert second.status_code == 201, second.json()

    shipment_line_a.refresh_from_db()
    assert shipment_line_a.actual_loaded_cartons == 11
    assert shipment_line_a.loading_status == ShipmentLine.LoadingStatus.EXCESS_LOADED


def test_patch_correction_recomputes_cumulative_without_reason(order, shipment, shipment_line_a):
    client = _client_as("Export Coordinator", "coord6")
    create_response = client.post(
        _transactions_url(order, shipment, shipment_line_a.id),
        {
            "date": "2026-01-06",
            "entry_type": "CARTON_LOADED",
            "cartons_loaded": 9,
            "variance_reason": "PACKING_SHORTAGE",
        },
        format="json",
    )
    transaction_id = create_response.json()["id"]

    response = client.patch(
        f"{_transactions_url(order, shipment, shipment_line_a.id)}{transaction_id}/",
        {"cartons_loaded": 10},
        format="json",
    )

    assert response.status_code == 200, response.json()
    shipment_line_a.refresh_from_db()
    assert shipment_line_a.actual_loaded_cartons == 10


def test_log_lists_across_lines_on_shipment(order, shipment, shipment_line_a, shipment_line_b):
    client = _client_as("Export Coordinator", "coord7")
    client.post(
        _transactions_url(order, shipment, shipment_line_a.id),
        {
            "date": "2026-01-06",
            "entry_type": "CARTON_LOADED",
            "cartons_loaded": 5,
            "variance_reason": "PACKING_SHORTAGE",
        },
        format="json",
    )
    client.post(
        _transactions_url(order, shipment, shipment_line_b.id),
        {
            "date": "2026-01-06",
            "entry_type": "CARTON_LOADED",
            "cartons_loaded": 3,
            "variance_reason": "PACKING_SHORTAGE",
        },
        format="json",
    )

    response = client.get(_log_url(order, shipment))

    assert response.status_code == 200
    body = response.json()
    assert body["count"] == 2
    skus = {row["customer_sku_code"] for row in body["results"]}
    assert skus == {"SKU-A", "SKU-B"}


def test_log_filters_by_line(order, shipment, shipment_line_a, shipment_line_b):
    client = _client_as("Export Coordinator", "coord8")
    client.post(
        _transactions_url(order, shipment, shipment_line_a.id),
        {
            "date": "2026-01-06",
            "entry_type": "CARTON_LOADED",
            "cartons_loaded": 5,
            "variance_reason": "PACKING_SHORTAGE",
        },
        format="json",
    )
    client.post(
        _transactions_url(order, shipment, shipment_line_b.id),
        {
            "date": "2026-01-06",
            "entry_type": "CARTON_LOADED",
            "cartons_loaded": 3,
            "variance_reason": "PACKING_SHORTAGE",
        },
        format="json",
    )

    response = client.get(_log_url(order, shipment), {"line": shipment_line_a.export_order_line_id})

    body = response.json()
    assert body["count"] == 1
    assert body["results"][0]["customer_sku_code"] == "SKU-A"


def test_log_excludes_other_shipments(order, shipment, shipment_line_a):
    other_shipment = Shipment.objects.create(
        shipment_number="EO-2026-0001-S02", export_order=order
    )
    client = _client_as("Export Coordinator", "coord9")
    client.post(
        _transactions_url(order, shipment, shipment_line_a.id),
        {
            "date": "2026-01-06",
            "entry_type": "CARTON_LOADED",
            "cartons_loaded": 5,
            "variance_reason": "PACKING_SHORTAGE",
        },
        format="json",
    )

    response = client.get(_log_url(order, other_shipment))

    assert response.json()["count"] == 0


def test_page_size_query_param_overrides_default(order, shipment, shipment_line_a):
    client = _client_as("Export Coordinator", "coord10")
    for _i in range(15):
        client.post(
            _transactions_url(order, shipment, shipment_line_a.id),
            {
                "date": "2026-01-06",
                "entry_type": "CARTON_LOADED",
                "cartons_loaded": 1,
                "variance_reason": "PACKING_SHORTAGE",
            },
            format="json",
        )

    response = client.get(_log_url(order, shipment), {"page_size": 10})

    body = response.json()
    assert body["count"] == 15
    assert len(body["results"]) == 10
    assert body["next"] is not None


def test_customer_role_cannot_view_log(order, shipment):
    client = _client_as("Customer", "cust1")

    response = client.get(_log_url(order, shipment))

    assert response.status_code == 403


def test_anonymous_cannot_view_log(order, shipment):
    client = APIClient()

    response = client.get(_log_url(order, shipment))

    assert response.status_code == 403


def test_customer_role_cannot_post_transaction(order, shipment, shipment_line_a):
    client = _client_as("Customer", "cust2")

    response = client.post(
        _transactions_url(order, shipment, shipment_line_a.id),
        {"date": "2026-01-06", "entry_type": "CARTON_LOADED", "cartons_loaded": 5},
        format="json",
    )

    assert response.status_code == 403
