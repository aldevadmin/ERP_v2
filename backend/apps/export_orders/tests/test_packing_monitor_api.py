import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework.test import APIClient

from apps.accounts.models import Employee
from apps.customers.models import Customer
from apps.export_orders.models import ExportOrder, ExportOrderLine, PackingTransaction

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
        original_customer_quantity=100,
        original_customer_unit=ExportOrderLine.Unit.PIECE,
        pieces_per_pouch=1,
        pouches_per_carton=1,
    )


@pytest.fixture
def employee(organization):
    return Employee.objects.create(
        employee_code="EMP-PACK-1", full_name="Priya K", organization=organization
    )


@pytest.fixture
def piece_only_line(order):
    return ExportOrderLine.objects.create(
        export_order=order,
        line_number=2,
        customer_sku_code="SKU-B",
        original_customer_quantity=50,
        original_customer_unit=ExportOrderLine.Unit.PIECE,
    )


def _monitor_url(order: ExportOrder) -> str:
    return f"/api/v1/export-orders/{order.id}/packing-monitor/"


def _transactions_url(order: ExportOrder, line: ExportOrderLine) -> str:
    return f"/api/v1/export-orders/{order.id}/lines/{line.id}/packing-transactions/"


def _transaction_detail_url(order: ExportOrder, line: ExportOrderLine, transaction_id: int) -> str:
    return (
        f"/api/v1/export-orders/{order.id}/lines/{line.id}/"
        f"packing-transactions/{transaction_id}/"
    )


def test_monitor_excludes_non_cartonized_lines(order, line, piece_only_line):
    client = _client_as("Export Coordinator", "coord1")

    response = client.get(_monitor_url(order))

    assert response.status_code == 200
    rows = response.json()
    assert len(rows) == 1
    assert rows[0]["customer_sku_code"] == "SKU-A"


def test_monitor_row_before_any_transaction(order, line):
    client = _client_as("Export Coordinator", "coord2")

    response = client.get(_monitor_url(order))

    row = response.json()[0]
    assert row["required_cartons"] == 100
    assert row["packed_cartons"] == 0
    assert row["extra_pouches"] == 0
    assert row["balance"] == 100
    assert row["progress"] == 0


def test_post_carton_completed_entry(order, line, employee):
    client = _client_as("Export Coordinator", "coord3")

    response = client.post(
        _transactions_url(order, line),
        {
            "date": "2026-01-05",
            "entry_type": "CARTON_COMPLETED",
            "cartons_packed": 80,
            "packed_by": employee.id,
        },
        format="json",
    )

    assert response.status_code == 201, response.json()
    assert response.json()["entered_by"] == "coord3"
    assert response.json()["calculated_pieces"] == 80


def test_post_pouch_packed_entry(order, line, employee):
    client = _client_as("Export Coordinator", "coord4")

    response = client.post(
        _transactions_url(order, line),
        {
            "date": "2026-01-05",
            "entry_type": "POUCH_PACKED",
            "pouches_packed": 150,
            "packed_by": employee.id,
        },
        format="json",
    )

    assert response.status_code == 201, response.json()
    assert response.json()["calculated_pieces"] == 150


def test_monitor_row_includes_pieces_based_fields(order, line, employee):
    client = _client_as("Export Coordinator", "coord-pieces")
    client.post(
        _transactions_url(order, line),
        {
            "date": "2026-01-05",
            "entry_type": "CARTON_COMPLETED",
            "cartons_packed": 80,
            "packed_by": employee.id,
        },
        format="json",
    )

    response = client.get(_monitor_url(order))
    row = response.json()[0]

    # line: 100 pieces required, pieces_per_pouch=1, pouches_per_carton=1
    assert row["packable_qty"] == 100
    assert row["packed_pieces"] == 80
    assert row["balance_pieces"] == 20
    assert row["progress_pieces"] == pytest.approx(0.8)
    assert row["last_transaction_at"] is not None


def test_worked_example_via_api(order, line, employee):
    client = _client_as("Export Coordinator", "coord5")
    client.post(
        _transactions_url(order, line),
        {
            "date": "2026-01-05",
            "entry_type": "CARTON_COMPLETED",
            "cartons_packed": 80,
            "packed_by": employee.id,
        },
        format="json",
    )
    client.post(
        _transactions_url(order, line),
        {
            "date": "2026-01-05",
            "entry_type": "POUCH_PACKED",
            "pouches_packed": 150,
            "packed_by": employee.id,
        },
        format="json",
    )

    response = client.get(_monitor_url(order))
    row = response.json()[0]

    assert row["required_cartons"] == 100
    assert row["packed_cartons"] == 80
    assert row["extra_pouches"] == 150
    assert row["balance"] == 20
    assert row["progress"] == pytest.approx(0.8)


def test_post_rejected_when_line_not_cartonized(order, piece_only_line, employee):
    client = _client_as("Export Coordinator", "coord6")

    response = client.post(
        _transactions_url(order, piece_only_line),
        {
            "date": "2026-01-05",
            "entry_type": "CARTON_COMPLETED",
            "cartons_packed": 10,
            "packed_by": employee.id,
        },
        format="json",
    )

    assert response.status_code == 400
    assert not PackingTransaction.objects.exists()


def test_post_rejected_when_cartons_missing_for_carton_completed(order, line, employee):
    client = _client_as("Export Coordinator", "coord7")

    response = client.post(
        _transactions_url(order, line),
        {"date": "2026-01-05", "entry_type": "CARTON_COMPLETED", "packed_by": employee.id},
        format="json",
    )

    assert response.status_code == 400
    assert "cartons_packed" in response.json()


def test_post_rejected_when_pouches_set_for_carton_completed(order, line, employee):
    client = _client_as("Export Coordinator", "coord8")

    response = client.post(
        _transactions_url(order, line),
        {
            "date": "2026-01-05",
            "entry_type": "CARTON_COMPLETED",
            "cartons_packed": 10,
            "pouches_packed": 5,
            "packed_by": employee.id,
        },
        format="json",
    )

    assert response.status_code == 400
    assert "pouches_packed" in response.json()


def test_post_rejected_when_quantity_is_zero(order, line, employee):
    client = _client_as("Export Coordinator", "coord9")

    response = client.post(
        _transactions_url(order, line),
        {
            "date": "2026-01-05",
            "entry_type": "CARTON_COMPLETED",
            "cartons_packed": 0,
            "packed_by": employee.id,
        },
        format="json",
    )

    assert response.status_code == 400


def test_post_rejected_when_packed_by_missing(order, line):
    client = _client_as("Export Coordinator", "coord9b")

    response = client.post(
        _transactions_url(order, line),
        {"date": "2026-01-05", "entry_type": "CARTON_COMPLETED", "cartons_packed": 10},
        format="json",
    )

    assert response.status_code == 400
    assert "packed_by" in response.json()


def test_post_succeeds_when_shift_team_omitted(order, line, employee):
    client = _client_as("Export Coordinator", "coord9c")

    response = client.post(
        _transactions_url(order, line),
        {
            "date": "2026-01-05",
            "entry_type": "CARTON_COMPLETED",
            "cartons_packed": 10,
            "packed_by": employee.id,
        },
        format="json",
    )

    assert response.status_code == 201, response.json()
    assert response.json()["shift_team"] == ""


def test_patch_corrects_transaction(order, line, employee):
    client = _client_as("Export Coordinator", "coord10")
    create_response = client.post(
        _transactions_url(order, line),
        {
            "date": "2026-01-05",
            "entry_type": "CARTON_COMPLETED",
            "cartons_packed": 80,
            "packed_by": employee.id,
        },
        format="json",
    )
    transaction_id = create_response.json()["id"]

    response = client.patch(
        _transaction_detail_url(order, line, transaction_id),
        {"cartons_packed": 85},
        format="json",
    )

    assert response.status_code == 200
    line.refresh_from_db()
    assert line.packed_cartons == 85


def test_list_transactions_for_line(order, line, employee):
    client = _client_as("Export Coordinator", "coord11")
    client.post(
        _transactions_url(order, line),
        {
            "date": "2026-01-05",
            "entry_type": "CARTON_COMPLETED",
            "cartons_packed": 80,
            "packed_by": employee.id,
        },
        format="json",
    )
    client.post(
        _transactions_url(order, line),
        {
            "date": "2026-01-06",
            "entry_type": "POUCH_PACKED",
            "pouches_packed": 150,
            "packed_by": employee.id,
        },
        format="json",
    )

    response = client.get(_transactions_url(order, line))

    assert response.status_code == 200
    assert len(response.json()) == 2
