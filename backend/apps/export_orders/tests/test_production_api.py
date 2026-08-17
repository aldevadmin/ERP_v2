import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework.test import APIClient

from apps.customers.models import Customer
from apps.export_orders.models import (
    ExportOrder,
    ExportOrderLine,
    ProductionRequirement,
    ProductionTransaction,
    SKUSupplyPlan,
)

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
        original_customer_quantity=50_000,
        original_customer_unit=ExportOrderLine.Unit.PIECE,
    )


def _requirements_url(order: ExportOrder) -> str:
    return f"/api/v1/export-orders/{order.id}/production-requirements/"


def _transactions_url(order: ExportOrder, line: ExportOrderLine) -> str:
    return f"/api/v1/export-orders/{order.id}/lines/{line.id}/production-transactions/"


def _transaction_detail_url(order: ExportOrder, line: ExportOrderLine, transaction_id: int) -> str:
    return (
        f"/api/v1/export-orders/{order.id}/lines/{line.id}/"
        f"production-transactions/{transaction_id}/"
    )


def _supply_plans_url(order: ExportOrder) -> str:
    return f"/api/v1/export-orders/{order.id}/supply-plans/"


def test_list_excludes_lines_with_no_planned_production(order, line):
    client = _client_as("Export Coordinator", "coord1")

    response = client.get(_requirements_url(order))

    assert response.status_code == 200
    assert response.json() == []


def test_list_returns_virtual_row_before_any_transaction(order, line):
    SKUSupplyPlan.objects.create(export_order_line=line, quantity_to_produce=25_000)
    client = _client_as("Export Coordinator", "coord2")

    response = client.get(_requirements_url(order))

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    row = body[0]
    assert row["planned_qty"] == 25_000
    assert row["cumulative_accepted"] == 0
    assert row["status"] == "NOT_STARTED"
    assert not ProductionRequirement.objects.filter(export_order_line=line).exists()


def test_post_transaction_auto_creates_requirement(order, line):
    SKUSupplyPlan.objects.create(export_order_line=line, quantity_to_produce=25_000)
    client = _client_as("Export Coordinator", "coord3")

    response = client.post(
        _transactions_url(order, line),
        {"date": "2026-01-05", "quantity_produced": 26_000, "quantity_accepted": 23_000,
         "quantity_rejected": 3_000, "party_team": "Production Team A"},
        format="json",
    )

    assert response.status_code == 201, response.json()
    requirement = ProductionRequirement.objects.get(export_order_line=line)
    assert requirement.cumulative_accepted == 23_000
    assert response.json()["entered_by"] == "coord3"


def test_worked_example_via_api(order, line):
    SKUSupplyPlan.objects.create(export_order_line=line, quantity_to_produce=25_000)
    client = _client_as("Export Coordinator", "coord4")

    client.post(
        _transactions_url(order, line),
        {"date": "2026-01-05", "quantity_produced": 26_000, "quantity_accepted": 23_000,
         "quantity_rejected": 3_000, "party_team": "Production Team A"},
        format="json",
    )

    response = client.get(_requirements_url(order))
    row = response.json()[0]

    assert row["cumulative_accepted"] == 23_000
    assert row["progress"] == pytest.approx(0.92)
    assert row["balance"] == 2_000
    assert row["status"] != "READY"


def test_post_rejected_when_no_planned_production(order, line):
    client = _client_as("Export Coordinator", "coord5")

    response = client.post(
        _transactions_url(order, line),
        {"date": "2026-01-05", "quantity_produced": 100, "quantity_accepted": 100,
         "quantity_rejected": 0, "party_team": "Production Team A"},
        format="json",
    )

    assert response.status_code == 400
    assert not ProductionTransaction.objects.exists()


def test_post_rejected_when_party_team_missing(order, line):
    SKUSupplyPlan.objects.create(export_order_line=line, quantity_to_produce=10_000)
    client = _client_as("Export Coordinator", "coord11")

    response = client.post(
        _transactions_url(order, line),
        {"date": "2026-01-05", "quantity_produced": 1_000, "quantity_accepted": 900,
         "quantity_rejected": 100},
        format="json",
    )

    assert response.status_code == 400
    assert "party_team" in response.json()


def test_post_rejected_when_accepted_plus_rejected_exceeds_produced(order, line):
    SKUSupplyPlan.objects.create(export_order_line=line, quantity_to_produce=10_000)
    client = _client_as("Export Coordinator", "coord6")

    response = client.post(
        _transactions_url(order, line),
        {"date": "2026-01-05", "quantity_produced": 1_000, "quantity_accepted": 900,
         "quantity_rejected": 200, "party_team": "Production Team A"},
        format="json",
    )

    assert response.status_code == 400
    assert "quantity_produced" in response.json()


def test_patch_corrects_transaction_and_updates_cumulative(order, line):
    SKUSupplyPlan.objects.create(export_order_line=line, quantity_to_produce=10_000)
    client = _client_as("Export Coordinator", "coord7")
    create_response = client.post(
        _transactions_url(order, line),
        {"date": "2026-01-05", "quantity_produced": 1_000, "quantity_accepted": 900,
         "quantity_rejected": 100, "party_team": "Production Team A"},
        format="json",
    )
    transaction_id = create_response.json()["id"]

    response = client.patch(
        _transaction_detail_url(order, line, transaction_id),
        {"quantity_accepted": 950, "quantity_rejected": 50},
        format="json",
    )

    assert response.status_code == 200
    requirement = ProductionRequirement.objects.get(export_order_line=line)
    assert requirement.cumulative_accepted == 950


def test_accepted_from_production_reflected_on_sku_planning_summary(order, line):
    SKUSupplyPlan.objects.create(export_order_line=line, quantity_to_produce=10_000)
    client = _client_as("Export Coordinator", "coord8")
    client.post(
        _transactions_url(order, line),
        {"date": "2026-01-05", "quantity_produced": 5_000, "quantity_accepted": 4_500,
         "quantity_rejected": 500, "party_team": "Production Team A"},
        format="json",
    )

    response = client.get(_supply_plans_url(order))

    row = response.json()[0]
    assert row["accepted_from_production"] == 4_500


def test_list_transactions_for_line(order, line):
    SKUSupplyPlan.objects.create(export_order_line=line, quantity_to_produce=10_000)
    client = _client_as("Export Coordinator", "coord9")
    client.post(
        _transactions_url(order, line),
        {"date": "2026-01-05", "quantity_produced": 1_000, "quantity_accepted": 900,
         "quantity_rejected": 100, "party_team": "Production Team A"},
        format="json",
    )

    response = client.get(_transactions_url(order, line))

    assert response.status_code == 200
    assert len(response.json()) == 1
