import pytest

from apps.customers.models import Customer
from apps.export_orders.models import ExportOrder, ExportOrderLine, PackingTransaction

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
def line(order):
    return ExportOrderLine.objects.create(
        export_order=order,
        line_number=1,
        customer_sku_code="SKU-A",
        original_customer_quantity=1_000,
        original_customer_unit=ExportOrderLine.Unit.PIECE,
        pieces_per_pouch=10,
        pouches_per_carton=5,
    )


def test_str_includes_line_date_and_entry_type(line):
    transaction = PackingTransaction.objects.create(
        export_order_line=line,
        date="2026-01-05",
        entry_type=PackingTransaction.EntryType.CARTON_COMPLETED,
        cartons_packed=1,
    )

    assert str(transaction) == f"{line} — 2026-01-05 (CARTON_COMPLETED)"


def test_calculated_pieces_for_carton_completed(line):
    transaction = PackingTransaction.objects.create(
        export_order_line=line,
        date="2026-01-05",
        entry_type=PackingTransaction.EntryType.CARTON_COMPLETED,
        cartons_packed=4,
    )

    assert line.pieces_per_carton == 50
    assert transaction.calculated_pieces == 200


def test_calculated_pieces_for_pouch_packed(line):
    transaction = PackingTransaction.objects.create(
        export_order_line=line,
        date="2026-01-05",
        entry_type=PackingTransaction.EntryType.POUCH_PACKED,
        pouches_packed=7,
    )

    assert transaction.calculated_pieces == 70


def test_packed_pieces_combines_cartons_and_pouches(line):
    PackingTransaction.objects.create(
        export_order_line=line,
        date="2026-01-05",
        entry_type=PackingTransaction.EntryType.CARTON_COMPLETED,
        cartons_packed=4,
    )
    PackingTransaction.objects.create(
        export_order_line=line,
        date="2026-01-06",
        entry_type=PackingTransaction.EntryType.POUCH_PACKED,
        pouches_packed=7,
    )

    # 4 cartons * 50 pieces/carton + 7 pouches * 10 pieces/pouch
    assert line.packed_pieces == 270
    assert line.packing_balance_pieces == 1_000 - 270
    assert line.packing_progress_pieces == pytest.approx(270 / 1_000)


def test_packing_progress_pieces_is_none_when_no_required_pieces(order):
    empty_line = ExportOrderLine.objects.create(
        export_order=order,
        line_number=2,
        customer_sku_code="SKU-B",
        original_customer_quantity=0,
        original_customer_unit=ExportOrderLine.Unit.PIECE,
    )

    assert empty_line.packing_progress_pieces is None


def test_last_packing_transaction_at_is_none_with_no_transactions(line):
    assert line.last_packing_transaction_at is None


def test_last_packing_transaction_at_is_most_recent_transaction(line):
    PackingTransaction.objects.create(
        export_order_line=line,
        date="2026-01-05",
        entry_type=PackingTransaction.EntryType.CARTON_COMPLETED,
        cartons_packed=1,
    )
    second = PackingTransaction.objects.create(
        export_order_line=line,
        date="2026-01-06",
        entry_type=PackingTransaction.EntryType.POUCH_PACKED,
        pouches_packed=1,
    )

    assert line.last_packing_transaction_at == second.created_at


def test_ordering_is_newest_date_first(line):
    older = PackingTransaction.objects.create(
        export_order_line=line,
        date="2026-01-01",
        entry_type=PackingTransaction.EntryType.CARTON_COMPLETED,
        cartons_packed=1,
    )
    newer = PackingTransaction.objects.create(
        export_order_line=line,
        date="2026-01-10",
        entry_type=PackingTransaction.EntryType.CARTON_COMPLETED,
        cartons_packed=1,
    )

    assert list(line.packing_transactions.all()) == [newer, older]
