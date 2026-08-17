import pytest

from apps.customers.models import Customer
from apps.export_orders.models import (
    ExportOrder,
    ExportOrderLine,
    LoadingTransaction,
    PackingTransaction,
    Shipment,
    ShipmentLine,
)
from apps.products.models import Product

pytestmark = pytest.mark.django_db


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


def test_str_is_shipment_number(order):
    shipment = Shipment.objects.create(shipment_number="EO-2026-0001-S01", export_order=order)

    assert str(shipment) == "EO-2026-0001-S01"


def test_status_defaults_to_planning(order):
    shipment = Shipment.objects.create(shipment_number="EO-2026-0001-S01", export_order=order)

    assert shipment.status == Shipment.Status.PLANNING


def test_container_number_blank_by_default(order):
    shipment = Shipment.objects.create(shipment_number="EO-2026-0001-S01", export_order=order)

    assert shipment.container_number == ""


def test_container_number_can_be_assigned_later(order):
    shipment = Shipment.objects.create(shipment_number="EO-2026-0001-S01", export_order=order)

    shipment.container_number = "MSKU1234567"
    shipment.save(update_fields=["container_number"])
    shipment.refresh_from_db()

    assert shipment.container_number == "MSKU1234567"


def _shipment(line: ExportOrderLine, suffix: str = "S01") -> Shipment:
    return Shipment.objects.create(
        shipment_number=f"EO-2026-0001-{suffix}", export_order=line.export_order
    )


def _shipment_line(shipment: Shipment, line: ExportOrderLine, planned_qty: int) -> ShipmentLine:
    return ShipmentLine.objects.create(
        shipment=shipment,
        export_order_line=line,
        planned_qty=planned_qty,
    )


def _load(line: ShipmentLine, cartons: int, date: str = "2026-01-06") -> LoadingTransaction:
    return LoadingTransaction.objects.create(
        shipment_line=line,
        date=date,
        entry_type=LoadingTransaction.EntryType.CARTON_LOADED,
        cartons_loaded=cartons,
    )


def test_loading_fields_none_before_actual_entered(cartonized_line):
    shipment = _shipment(cartonized_line)
    line = _shipment_line(shipment, cartonized_line, planned_qty=500)

    assert line.actual_loaded_qty == 0
    assert line.difference_cartons is None
    assert line.loading_status is None


def test_loading_status_exact(cartonized_line):
    shipment = _shipment(cartonized_line)
    line = _shipment_line(shipment, cartonized_line, planned_qty=500)
    _load(line, 5)

    assert line.actual_loaded_qty == 500
    assert line.difference_cartons == 0
    assert line.loading_status == ShipmentLine.LoadingStatus.EXACT


def test_loading_status_short_loaded(cartonized_line):
    shipment = _shipment(cartonized_line)
    line = _shipment_line(shipment, cartonized_line, planned_qty=500)
    _load(line, 3)

    assert line.difference_cartons == -2
    assert line.loading_status == ShipmentLine.LoadingStatus.SHORT_LOADED


def test_loading_status_excess_loaded(cartonized_line):
    shipment = _shipment(cartonized_line)
    line = _shipment_line(shipment, cartonized_line, planned_qty=500)
    _load(line, 7)

    assert line.difference_cartons == 2
    assert line.loading_status == ShipmentLine.LoadingStatus.EXCESS_LOADED


def test_remaining_balance_across_shipments(cartonized_line):
    shipment_a = _shipment(cartonized_line, "S01")
    shipment_b = _shipment(cartonized_line, "S02")
    line_a = _shipment_line(shipment_a, cartonized_line, planned_qty=500)
    line_b = _shipment_line(shipment_b, cartonized_line, planned_qty=500)
    _load(line_a, 5)
    _load(line_b, 3)

    assert cartonized_line.total_actual_loaded_cartons == 8
    assert cartonized_line.remaining_balance_cartons == 2  # required 10 - loaded 8


def test_sync_stock_return_credits_packed_but_unloaded_surplus(cartonized_line, product):
    PackingTransaction.objects.create(
        export_order_line=cartonized_line,
        date="2026-01-05",
        entry_type=PackingTransaction.EntryType.CARTON_COMPLETED,
        cartons_packed=10,
    )
    shipment = _shipment(cartonized_line)
    line = _shipment_line(shipment, cartonized_line, planned_qty=1_000)
    _load(line, 8)

    cartonized_line.sync_stock_return()

    product.refresh_from_db()
    cartonized_line.refresh_from_db()
    assert product.available_qty == 2  # packed 10 - loaded 8
    assert cartonized_line.stock_returned_cartons == 2


def test_sync_stock_return_applies_only_the_delta_on_correction(cartonized_line, product):
    PackingTransaction.objects.create(
        export_order_line=cartonized_line,
        date="2026-01-05",
        entry_type=PackingTransaction.EntryType.CARTON_COMPLETED,
        cartons_packed=10,
    )
    shipment = _shipment(cartonized_line)
    line = _shipment_line(shipment, cartonized_line, planned_qty=1_000)
    transaction = _load(line, 8)
    cartonized_line.sync_stock_return()  # surplus 2 -> available_qty = 2

    transaction.cartons_loaded = 9
    transaction.save(update_fields=["cartons_loaded"])
    cartonized_line.sync_stock_return()  # surplus now 1 -> delta -1

    product.refresh_from_db()
    assert product.available_qty == 1


def test_sync_stock_return_split_across_shipments_no_double_credit(cartonized_line, product):
    PackingTransaction.objects.create(
        export_order_line=cartonized_line,
        date="2026-01-05",
        entry_type=PackingTransaction.EntryType.CARTON_COMPLETED,
        cartons_packed=10,
    )
    shipment_a = _shipment(cartonized_line, "S01")
    shipment_b = _shipment(cartonized_line, "S02")
    line_a = _shipment_line(shipment_a, cartonized_line, planned_qty=500)
    _load(line_a, 4)
    cartonized_line.sync_stock_return()
    line_b = _shipment_line(shipment_b, cartonized_line, planned_qty=500)
    _load(line_b, 4)
    cartonized_line.sync_stock_return()

    product.refresh_from_db()
    # total loaded across both shipments = 8, packed = 10 -> surplus 2, not 2+2
    assert product.available_qty == 2
