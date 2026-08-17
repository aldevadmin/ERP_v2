import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework.test import APIClient

from apps.customers.models import Customer
from apps.export_orders.models import ExportOrder, ExportOrderLine, SKUSupplyPlan
from apps.vendors.models import Vendor

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
    return ExportOrderLine.objects.create(
        export_order=order,
        line_number=1,
        customer_sku_code="SKU-A",
        original_customer_quantity=50_000,
        original_customer_unit=ExportOrderLine.Unit.PIECE,
    )


@pytest.fixture
def line_b(order):
    return ExportOrderLine.objects.create(
        export_order=order,
        line_number=2,
        customer_sku_code="SKU-B",
        original_customer_quantity=20_000,
        original_customer_unit=ExportOrderLine.Unit.PIECE,
    )


@pytest.fixture
def vendor(organization):
    return Vendor.objects.create(code="V1", name="Acme Supplies", organization=organization)


def _fulfilment_url(order: ExportOrder) -> str:
    return f"/api/v1/export-orders/{order.id}/fulfilment-transactions/"


def _production_transactions_url(order: ExportOrder, line: ExportOrderLine) -> str:
    return f"/api/v1/export-orders/{order.id}/lines/{line.id}/production-transactions/"


def _procurement_transactions_url(order: ExportOrder, line: ExportOrderLine) -> str:
    return f"/api/v1/export-orders/{order.id}/lines/{line.id}/procurement-transactions/"


def test_merges_production_and_procurement_across_every_sku(order, line_a, line_b, vendor):
    SKUSupplyPlan.objects.create(export_order_line=line_a, quantity_to_produce=10_000)
    SKUSupplyPlan.objects.create(export_order_line=line_b, quantity_to_procure=5_000)
    client = _client_as("Export Coordinator", "coord1")

    client.post(
        _production_transactions_url(order, line_a),
        {"date": "2026-01-05", "quantity_produced": 1_000, "quantity_accepted": 900,
         "quantity_rejected": 100, "party_team": "Production Team A"},
        format="json",
    )
    client.post(
        _procurement_transactions_url(order, line_b),
        {"date": "2026-01-06", "quantity_received": 500, "quantity_accepted": 450,
         "quantity_rejected": 50, "vendor": vendor.id, "party_team": "Acme Supplies"},
        format="json",
    )

    response = client.get(_fulfilment_url(order))

    assert response.status_code == 200
    body = response.json()
    assert body["count"] == 2
    sources = {row["source"] for row in body["results"]}
    assert sources == {"PRODUCTION", "PROCUREMENT"}


def test_sorted_newest_first(order, line_a):
    SKUSupplyPlan.objects.create(export_order_line=line_a, quantity_to_produce=10_000)
    client = _client_as("Export Coordinator", "coord2")

    client.post(
        _production_transactions_url(order, line_a),
        {"date": "2026-01-05", "quantity_produced": 100, "quantity_accepted": 100,
         "quantity_rejected": 0, "party_team": "Team A", "remarks": "first"},
        format="json",
    )
    client.post(
        _production_transactions_url(order, line_a),
        {"date": "2026-01-06", "quantity_produced": 200, "quantity_accepted": 200,
         "quantity_rejected": 0, "party_team": "Team A", "remarks": "second"},
        format="json",
    )

    response = client.get(_fulfilment_url(order))

    results = response.json()["results"]
    assert [row["remarks"] for row in results] == ["second", "first"]


def test_filters_by_line(order, line_a, line_b):
    SKUSupplyPlan.objects.create(export_order_line=line_a, quantity_to_produce=10_000)
    SKUSupplyPlan.objects.create(export_order_line=line_b, quantity_to_produce=5_000)
    client = _client_as("Export Coordinator", "coord3")

    client.post(
        _production_transactions_url(order, line_a),
        {"date": "2026-01-05", "quantity_produced": 100, "quantity_accepted": 100,
         "quantity_rejected": 0, "party_team": "Team A"},
        format="json",
    )
    client.post(
        _production_transactions_url(order, line_b),
        {"date": "2026-01-05", "quantity_produced": 200, "quantity_accepted": 200,
         "quantity_rejected": 0, "party_team": "Team B"},
        format="json",
    )

    response = client.get(_fulfilment_url(order), {"line": line_a.id})

    body = response.json()
    assert body["count"] == 1
    assert body["results"][0]["customer_sku_code"] == "SKU-A"


def test_paginated(order, line_a):
    SKUSupplyPlan.objects.create(export_order_line=line_a, quantity_to_produce=100_000)
    client = _client_as("Export Coordinator", "coord4")

    for _i in range(25):
        client.post(
            _production_transactions_url(order, line_a),
            {"date": "2026-01-05", "quantity_produced": 10, "quantity_accepted": 10,
             "quantity_rejected": 0, "party_team": "Team A"},
            format="json",
        )

    response = client.get(_fulfilment_url(order))

    body = response.json()
    assert body["count"] == 25
    assert len(body["results"]) == 20  # PAGE_SIZE
    assert body["next"] is not None


def test_customer_role_cannot_view(order):
    client = _client_as("Customer", "cust1")

    response = client.get(_fulfilment_url(order))

    assert response.status_code == 403


def test_anonymous_cannot_view(order):
    client = APIClient()

    response = client.get(_fulfilment_url(order))

    assert response.status_code == 403
