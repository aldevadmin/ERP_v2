import pytest
from django.db import IntegrityError, transaction

from apps.customers.models import Customer
from apps.export_orders.models import ExportOrder, ExportOrderPOVersion

pytestmark = pytest.mark.django_db


@pytest.fixture
def customer(organization):
    return Customer.objects.create(code="CUST-1", name="Acme Exports", organization=organization)


def test_order_number_must_be_unique(customer):
    ExportOrder.objects.create(
        order_number="EO-2026-0001",
        customer=customer,
        customer_po_number="PO-1",
        customer_po_date="2026-01-01",
    )

    with pytest.raises(IntegrityError), transaction.atomic():
        ExportOrder.objects.create(
            order_number="EO-2026-0001",
            customer=customer,
            customer_po_number="PO-2",
            customer_po_date="2026-01-02",
        )


def test_str_is_order_number(customer):
    order = ExportOrder.objects.create(
        order_number="EO-2026-0002",
        customer=customer,
        customer_po_number="PO-1",
        customer_po_date="2026-01-01",
    )

    assert str(order) == "EO-2026-0002"


def test_defaults_to_planning_status(customer):
    order = ExportOrder.objects.create(
        order_number="EO-2026-0003",
        customer=customer,
        customer_po_number="PO-1",
        customer_po_date="2026-01-01",
    )

    assert order.status == ExportOrder.Status.PLANNING


def test_po_version_number_unique_per_order(customer):
    order = ExportOrder.objects.create(
        order_number="EO-2026-0004",
        customer=customer,
        customer_po_number="PO-1",
        customer_po_date="2026-01-01",
    )
    ExportOrderPOVersion.objects.create(export_order=order, version_number=1, document="a.pdf")

    with pytest.raises(IntegrityError), transaction.atomic():
        ExportOrderPOVersion.objects.create(export_order=order, version_number=1, document="b.pdf")
