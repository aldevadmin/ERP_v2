import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework.test import APIClient

from apps.accounts.models import Employee
from apps.customers.models import Customer
from apps.export_orders.models import ExportOrder, ExportOrderLine

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
        pieces_per_pouch=1,
        pouches_per_carton=1,
    )


@pytest.fixture
def line_b(order):
    return ExportOrderLine.objects.create(
        export_order=order,
        line_number=2,
        customer_sku_code="SKU-B",
        original_customer_quantity=20_000,
        original_customer_unit=ExportOrderLine.Unit.PIECE,
        pieces_per_pouch=1,
        pouches_per_carton=1,
    )


@pytest.fixture
def employee(organization):
    return Employee.objects.create(
        employee_code="EMP-LOG-1", full_name="Priya K", organization=organization
    )


def _log_url(order: ExportOrder) -> str:
    return f"/api/v1/export-orders/{order.id}/packing-transactions/"


def _transactions_url(order: ExportOrder, line: ExportOrderLine) -> str:
    return f"/api/v1/export-orders/{order.id}/lines/{line.id}/packing-transactions/"


def test_lists_transactions_across_every_line(order, line_a, line_b, employee):
    client = _client_as("Export Coordinator", "coord1")
    client.post(
        _transactions_url(order, line_a),
        {"date": "2026-01-05", "entry_type": "CARTON_COMPLETED", "cartons_packed": 10,
         "packed_by": employee.id},
        format="json",
    )
    client.post(
        _transactions_url(order, line_b),
        {"date": "2026-01-06", "entry_type": "POUCH_PACKED", "pouches_packed": 5,
         "packed_by": employee.id},
        format="json",
    )

    response = client.get(_log_url(order))

    assert response.status_code == 200
    body = response.json()
    assert body["count"] == 2
    skus = {row["customer_sku_code"] for row in body["results"]}
    assert skus == {"SKU-A", "SKU-B"}


def test_sorted_newest_first(order, line_a, employee):
    client = _client_as("Export Coordinator", "coord2")
    client.post(
        _transactions_url(order, line_a),
        {"date": "2026-01-05", "entry_type": "CARTON_COMPLETED", "cartons_packed": 1,
         "packed_by": employee.id, "remarks": "first"},
        format="json",
    )
    client.post(
        _transactions_url(order, line_a),
        {"date": "2026-01-06", "entry_type": "CARTON_COMPLETED", "cartons_packed": 2,
         "packed_by": employee.id, "remarks": "second"},
        format="json",
    )

    response = client.get(_log_url(order))

    results = response.json()["results"]
    assert [row["remarks"] for row in results] == ["second", "first"]


def test_filters_by_line(order, line_a, line_b, employee):
    client = _client_as("Export Coordinator", "coord3")
    client.post(
        _transactions_url(order, line_a),
        {"date": "2026-01-05", "entry_type": "CARTON_COMPLETED", "cartons_packed": 1,
         "packed_by": employee.id},
        format="json",
    )
    client.post(
        _transactions_url(order, line_b),
        {"date": "2026-01-05", "entry_type": "CARTON_COMPLETED", "cartons_packed": 2,
         "packed_by": employee.id},
        format="json",
    )

    response = client.get(_log_url(order), {"line": line_a.id})

    body = response.json()
    assert body["count"] == 1
    assert body["results"][0]["customer_sku_code"] == "SKU-A"


def test_row_includes_packed_by_and_shift_team(order, line_a, employee):
    client = _client_as("Export Coordinator", "coord4")
    client.post(
        _transactions_url(order, line_a),
        {"date": "2026-01-05", "entry_type": "CARTON_COMPLETED", "cartons_packed": 1,
         "packed_by": employee.id, "shift_team": "Morning Shift"},
        format="json",
    )

    response = client.get(_log_url(order))

    row = response.json()["results"][0]
    assert row["packed_by_detail"]["full_name"] == "Priya K"
    assert row["shift_team"] == "Morning Shift"


def test_paginated_default_page_size(order, line_a, employee):
    client = _client_as("Export Coordinator", "coord5")
    for _i in range(25):
        client.post(
            _transactions_url(order, line_a),
            {"date": "2026-01-05", "entry_type": "CARTON_COMPLETED", "cartons_packed": 1,
             "packed_by": employee.id},
            format="json",
        )

    response = client.get(_log_url(order))

    body = response.json()
    assert body["count"] == 25
    assert len(body["results"]) == 20  # project-wide PAGE_SIZE default
    assert body["next"] is not None


def test_page_size_query_param_overrides_default(order, line_a, employee):
    client = _client_as("Export Coordinator", "coord6")
    for _i in range(15):
        client.post(
            _transactions_url(order, line_a),
            {"date": "2026-01-05", "entry_type": "CARTON_COMPLETED", "cartons_packed": 1,
             "packed_by": employee.id},
            format="json",
        )

    response = client.get(_log_url(order), {"page_size": 10})

    body = response.json()
    assert body["count"] == 15
    assert len(body["results"]) == 10
    assert body["next"] is not None


def test_customer_role_cannot_view(order):
    client = _client_as("Customer", "cust1")

    response = client.get(_log_url(order))

    assert response.status_code == 403


def test_anonymous_cannot_view(order):
    client = APIClient()

    response = client.get(_log_url(order))

    assert response.status_code == 403
