import pytest
from django.db import IntegrityError, transaction

from apps.customers.models import Customer
from apps.export_orders.models import ExportOrder, ExportOrderLine, PackingTransaction
from apps.items.models import Item

pytestmark = pytest.mark.django_db


@pytest.fixture
def customer(organization):
    return Customer.objects.create(code="CUST-1", name="Acme Exports", organization=organization)


@pytest.fixture
def order(customer):
    return ExportOrder.objects.create(
        order_number="EO-2026-0001",
        customer=customer,
        customer_po_number="PO-1",
        customer_po_date="2026-01-01",
    )


def test_line_number_sequential_per_order(order):
    first = ExportOrderLine.objects.create(
        export_order=order,
        line_number=1,
        customer_sku_code="SKU-A",
        original_customer_quantity=10,
        original_customer_unit=ExportOrderLine.Unit.PIECE,
    )
    second = ExportOrderLine.objects.create(
        export_order=order,
        line_number=2,
        customer_sku_code="SKU-B",
        original_customer_quantity=20,
        original_customer_unit=ExportOrderLine.Unit.PIECE,
    )

    assert first.line_number == 1
    assert second.line_number == 2


def test_line_number_scoped_per_order_not_global(customer, order):
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
    other_line = ExportOrderLine.objects.create(
        export_order=other_order,
        line_number=1,
        customer_sku_code="SKU-B",
        original_customer_quantity=5,
        original_customer_unit=ExportOrderLine.Unit.PIECE,
    )

    assert other_line.line_number == 1


def test_line_number_unique_constraint(order):
    ExportOrderLine.objects.create(
        export_order=order,
        line_number=1,
        customer_sku_code="SKU-A",
        original_customer_quantity=10,
        original_customer_unit=ExportOrderLine.Unit.PIECE,
    )

    with pytest.raises(IntegrityError), transaction.atomic():
        ExportOrderLine.objects.create(
            export_order=order,
            line_number=1,
            customer_sku_code="SKU-B",
            original_customer_quantity=5,
            original_customer_unit=ExportOrderLine.Unit.PIECE,
        )


def test_str_includes_order_number_and_line_number(order):
    line = ExportOrderLine.objects.create(
        export_order=order,
        line_number=1,
        customer_sku_code="SKU-A",
        original_customer_quantity=10,
        original_customer_unit=ExportOrderLine.Unit.PIECE,
    )

    assert str(line) == "EO-2026-0001 — line 1"


def test_pieces_per_carton_none_when_either_input_missing(order):
    line = ExportOrderLine.objects.create(
        export_order=order,
        line_number=1,
        customer_sku_code="SKU-A",
        original_customer_quantity=10,
        original_customer_unit=ExportOrderLine.Unit.PIECE,
        pieces_per_pouch=10,
    )

    assert line.pieces_per_carton is None


def test_pieces_per_carton_computed_when_both_present(order):
    line = ExportOrderLine.objects.create(
        export_order=order,
        line_number=1,
        customer_sku_code="SKU-A",
        original_customer_quantity=10,
        original_customer_unit=ExportOrderLine.Unit.PIECE,
        pieces_per_pouch=10,
        pouches_per_carton=5,
    )

    assert line.pieces_per_carton == 50


def test_required_pieces_piece_unit(order):
    line = ExportOrderLine.objects.create(
        export_order=order,
        line_number=1,
        customer_sku_code="SKU-A",
        original_customer_quantity=100,
        original_customer_unit=ExportOrderLine.Unit.PIECE,
    )

    assert line.required_pieces == 100
    assert line.required_pouches is None
    assert line.required_cartons is None


def test_required_pieces_pouch_unit(order):
    line = ExportOrderLine.objects.create(
        export_order=order,
        line_number=1,
        customer_sku_code="SKU-A",
        original_customer_quantity=10,
        original_customer_unit=ExportOrderLine.Unit.POUCH,
        pieces_per_pouch=12,
    )

    assert line.required_pieces == 120


def test_required_pieces_carton_unit(order):
    line = ExportOrderLine.objects.create(
        export_order=order,
        line_number=1,
        customer_sku_code="SKU-A",
        original_customer_quantity=3,
        original_customer_unit=ExportOrderLine.Unit.CARTON,
        pieces_per_pouch=10,
        pouches_per_carton=20,
    )

    assert line.required_pieces == 600


def test_required_pouches_rounds_up(order):
    line = ExportOrderLine.objects.create(
        export_order=order,
        line_number=1,
        customer_sku_code="SKU-A",
        original_customer_quantity=105,
        original_customer_unit=ExportOrderLine.Unit.PIECE,
        pieces_per_pouch=10,
    )

    assert line.required_pouches == 11


def test_required_cartons_rounds_up(order):
    line = ExportOrderLine.objects.create(
        export_order=order,
        line_number=1,
        customer_sku_code="SKU-A",
        original_customer_quantity=105,
        original_customer_unit=ExportOrderLine.Unit.PIECE,
        pieces_per_pouch=10,
        pouches_per_carton=3,
    )

    # 105 pieces -> 11 pouches (rounded up) -> 4 cartons (rounded up)
    assert line.required_pouches == 11
    assert line.required_cartons == 4


def test_required_stickers_zero_when_flag_false(order):
    line = ExportOrderLine.objects.create(
        export_order=order,
        line_number=1,
        customer_sku_code="SKU-A",
        original_customer_quantity=105,
        original_customer_unit=ExportOrderLine.Unit.PIECE,
        pieces_per_pouch=10,
        has_retail_sticker=False,
    )

    assert line.required_stickers == 0


def test_required_stickers_zero_when_flag_none(order):
    line = ExportOrderLine.objects.create(
        export_order=order,
        line_number=1,
        customer_sku_code="SKU-A",
        original_customer_quantity=105,
        original_customer_unit=ExportOrderLine.Unit.PIECE,
        pieces_per_pouch=10,
    )

    assert line.has_retail_sticker is None
    assert line.required_stickers == 0


def test_required_stickers_matches_required_pouches_when_flag_true(order):
    line = ExportOrderLine.objects.create(
        export_order=order,
        line_number=1,
        customer_sku_code="SKU-A",
        original_customer_quantity=105,
        original_customer_unit=ExportOrderLine.Unit.PIECE,
        pieces_per_pouch=10,
        has_retail_sticker=True,
    )

    assert line.required_pouches == 11
    assert line.required_stickers == 11


def test_internal_sku_optional(organization, order):
    product = Item.objects.create(
        code="SKU-1",
        name="Areca Plate",
        item_class=Item.ItemClass.FINISHED_GOOD,
        organization=organization,
    )
    line = ExportOrderLine.objects.create(
        export_order=order,
        line_number=1,
        customer_sku_code="SKU-A",
        item=product,
        original_customer_quantity=10,
        original_customer_unit=ExportOrderLine.Unit.PIECE,
    )

    assert line.item == product


def test_packing_properties_zero_with_no_transactions(order):
    line = ExportOrderLine.objects.create(
        export_order=order,
        line_number=1,
        customer_sku_code="SKU-A",
        original_customer_quantity=100,
        original_customer_unit=ExportOrderLine.Unit.PIECE,
        pieces_per_pouch=1,
        pouches_per_carton=1,
    )

    assert line.required_cartons == 100
    assert line.packed_cartons == 0
    assert line.extra_pouches == 0
    assert line.packing_balance == 100
    assert line.packing_progress == 0


def test_packing_worked_example(order):
    """Required 100, Completed 80, Extra Pouches 150 -> Progress 80%. Extra
    pouches never inflate the headline percentage (business-rules.md §6).
    """
    line = ExportOrderLine.objects.create(
        export_order=order,
        line_number=1,
        customer_sku_code="SKU-A",
        original_customer_quantity=100,
        original_customer_unit=ExportOrderLine.Unit.PIECE,
        pieces_per_pouch=1,
        pouches_per_carton=1,
    )
    PackingTransaction.objects.create(
        export_order_line=line,
        date="2026-01-05",
        entry_type=PackingTransaction.EntryType.CARTON_COMPLETED,
        cartons_packed=80,
    )
    PackingTransaction.objects.create(
        export_order_line=line,
        date="2026-01-05",
        entry_type=PackingTransaction.EntryType.POUCH_PACKED,
        pouches_packed=150,
    )

    assert line.required_cartons == 100
    assert line.packed_cartons == 80
    assert line.extra_pouches == 150
    assert line.packing_balance == 20
    assert line.packing_progress == pytest.approx(0.8)


def test_packing_sums_multiple_transactions(order):
    line = ExportOrderLine.objects.create(
        export_order=order,
        line_number=1,
        customer_sku_code="SKU-A",
        original_customer_quantity=100,
        original_customer_unit=ExportOrderLine.Unit.PIECE,
        pieces_per_pouch=1,
        pouches_per_carton=1,
    )
    PackingTransaction.objects.create(
        export_order_line=line,
        date="2026-01-05",
        entry_type=PackingTransaction.EntryType.CARTON_COMPLETED,
        cartons_packed=30,
    )
    PackingTransaction.objects.create(
        export_order_line=line,
        date="2026-01-06",
        entry_type=PackingTransaction.EntryType.CARTON_COMPLETED,
        cartons_packed=50,
    )

    assert line.packed_cartons == 80


def test_packing_pouches_never_inflate_cartons(order):
    line = ExportOrderLine.objects.create(
        export_order=order,
        line_number=1,
        customer_sku_code="SKU-A",
        original_customer_quantity=100,
        original_customer_unit=ExportOrderLine.Unit.PIECE,
        pieces_per_pouch=1,
        pouches_per_carton=1,
    )
    PackingTransaction.objects.create(
        export_order_line=line,
        date="2026-01-05",
        entry_type=PackingTransaction.EntryType.POUCH_PACKED,
        pouches_packed=99,
    )

    assert line.packed_cartons == 0
    assert line.extra_pouches == 99
    assert line.packing_progress == 0


def test_packing_progress_none_when_not_cartonized(order):
    line = ExportOrderLine.objects.create(
        export_order=order,
        line_number=1,
        customer_sku_code="SKU-A",
        original_customer_quantity=100,
        original_customer_unit=ExportOrderLine.Unit.PIECE,
    )

    assert line.required_cartons is None
    assert line.packing_progress is None
    assert line.packing_balance is None
