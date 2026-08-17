import pytest
from django.db import IntegrityError, transaction

from apps.customers.models import Customer
from apps.export_orders.models import ExportOrder, ExportOrderLine, PackingMaterialRequirement

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
        pieces_per_pouch=1,
        pouches_per_carton=1,
        has_retail_sticker=True,
    )


def test_str_includes_line_and_material_type(line):
    requirement = PackingMaterialRequirement.objects.create(
        export_order_line=line, material_type=PackingMaterialRequirement.MaterialType.CARTON
    )

    assert str(requirement) == f"{line} — Cartons"


def test_carton_required_qty_reads_live_from_line(line):
    requirement = PackingMaterialRequirement.objects.create(
        export_order_line=line, material_type=PackingMaterialRequirement.MaterialType.CARTON
    )

    assert requirement.required_qty == line.required_cartons

    line.original_customer_quantity = 2_000
    line.save(update_fields=["original_customer_quantity"])
    requirement.refresh_from_db()

    assert requirement.required_qty == 2_000


def test_pouch_required_qty_reads_live_from_line(line):
    requirement = PackingMaterialRequirement.objects.create(
        export_order_line=line, material_type=PackingMaterialRequirement.MaterialType.POUCH
    )

    assert requirement.required_qty == line.required_pouches


def test_retail_sticker_required_qty_reads_live_from_line(line):
    requirement = PackingMaterialRequirement.objects.create(
        export_order_line=line,
        material_type=PackingMaterialRequirement.MaterialType.RETAIL_STICKER,
    )

    assert requirement.required_qty == line.required_stickers == 1_000


def test_box_label_required_qty_is_manual(line):
    requirement = PackingMaterialRequirement.objects.create(
        export_order_line=line, material_type=PackingMaterialRequirement.MaterialType.BOX_LABEL
    )

    assert requirement.required_qty == 0

    requirement.manual_required_qty = 750
    requirement.save(update_fields=["manual_required_qty"])

    assert requirement.required_qty == 750


def test_worked_example_shortage(line):
    """Planned 1,000 cartons, 600 in stock -> Shortage 400. Operators
    should be able to read Available/Short/Ordered/Expected at a glance.
    """
    requirement = PackingMaterialRequirement.objects.create(
        export_order_line=line,
        material_type=PackingMaterialRequirement.MaterialType.CARTON,
        available_stock=600,
    )

    assert requirement.required_qty == 1_000
    assert requirement.available_stock == 600
    assert requirement.shortage == 400


def test_shortage_never_negative_when_overstocked(line):
    requirement = PackingMaterialRequirement.objects.create(
        export_order_line=line,
        material_type=PackingMaterialRequirement.MaterialType.CARTON,
        available_stock=5_000,
    )

    assert requirement.shortage == 0


def test_to_procure_qty_defaults_to_shortage(line):
    requirement = PackingMaterialRequirement.objects.create(
        export_order_line=line,
        material_type=PackingMaterialRequirement.MaterialType.CARTON,
        available_stock=600,
    )

    assert requirement.shortage == 400
    assert requirement.to_procure_qty == 400


def test_to_procure_qty_uses_manual_override_when_set(line):
    """A coordinator procuring extra to cover expected packing damage."""
    requirement = PackingMaterialRequirement.objects.create(
        export_order_line=line,
        material_type=PackingMaterialRequirement.MaterialType.CARTON,
        available_stock=600,
        manual_to_procure_qty=500,
    )

    assert requirement.shortage == 400
    assert requirement.to_procure_qty == 500


def test_to_procure_qty_override_is_not_clamped_to_shortage(line):
    """A judgment call, not a correction — a lower override is honored too."""
    requirement = PackingMaterialRequirement.objects.create(
        export_order_line=line,
        material_type=PackingMaterialRequirement.MaterialType.CARTON,
        available_stock=600,
        manual_to_procure_qty=100,
    )

    assert requirement.shortage == 400
    assert requirement.to_procure_qty == 100


def test_unique_constraint_per_line_and_material_type(line):
    PackingMaterialRequirement.objects.create(
        export_order_line=line, material_type=PackingMaterialRequirement.MaterialType.CARTON
    )

    with pytest.raises(IntegrityError), transaction.atomic():
        PackingMaterialRequirement.objects.create(
            export_order_line=line, material_type=PackingMaterialRequirement.MaterialType.CARTON
        )
