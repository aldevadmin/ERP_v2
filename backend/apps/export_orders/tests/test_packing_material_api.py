import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework.test import APIClient

from apps.accounts.models import Employee
from apps.customers.models import Customer
from apps.export_orders.models import ExportOrder, ExportOrderLine, PackingMaterialRequirement

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
        original_customer_quantity=1_000,
        original_customer_unit=ExportOrderLine.Unit.PIECE,
        pieces_per_pouch=1,
        pouches_per_carton=1,
        has_retail_sticker=True,
    )


@pytest.fixture
def piece_only_line(order):
    """No packing config at all — should be excluded from every tab."""
    return ExportOrderLine.objects.create(
        export_order=order,
        line_number=2,
        customer_sku_code="SKU-B",
        original_customer_quantity=50,
        original_customer_unit=ExportOrderLine.Unit.PIECE,
    )


def _list_url(order: ExportOrder, material_type: str) -> str:
    return (
        f"/api/v1/export-orders/{order.id}/packing-material-requirements/"
        f"?material_type={material_type}"
    )


def _detail_url(order: ExportOrder, line: ExportOrderLine, material_type: str) -> str:
    return (
        f"/api/v1/export-orders/{order.id}/lines/{line.id}/"
        f"packing-material-requirements/{material_type}/"
    )


def test_list_requires_material_type(order, line):
    client = _client_as("Export Coordinator", "coord1")

    response = client.get(f"/api/v1/export-orders/{order.id}/packing-material-requirements/")

    assert response.status_code == 400


def test_list_excludes_lines_with_no_packing_config(order, line, piece_only_line):
    client = _client_as("Export Coordinator", "coord2")

    response = client.get(_list_url(order, "CARTON"))

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["customer_sku_code"] == "SKU-A"


def test_list_returns_virtual_row_before_any_save(order, line):
    client = _client_as("Export Coordinator", "coord3")

    response = client.get(_list_url(order, "CARTON"))

    body = response.json()
    assert len(body) == 1
    row = body[0]
    assert row["required_qty"] == 1_000
    assert row["available_stock"] == 0
    assert row["shortage"] == 1_000
    assert row["status"] == "NOT_STARTED"
    assert not PackingMaterialRequirement.objects.filter(export_order_line=line).exists()


def test_retail_sticker_tab_excludes_line_without_flag(order, customer):
    other_line = ExportOrderLine.objects.create(
        export_order=order,
        line_number=3,
        customer_sku_code="SKU-C",
        original_customer_quantity=10,
        original_customer_unit=ExportOrderLine.Unit.PIECE,
        pieces_per_pouch=1,
        has_retail_sticker=False,
    )
    client = _client_as("Export Coordinator", "coord4")

    response = client.get(_list_url(order, "RETAIL_STICKER"))

    codes = [row["customer_sku_code"] for row in response.json()]
    assert other_line.customer_sku_code not in codes


def test_get_singleton_returns_virtual_default(order, line):
    client = _client_as("Export Coordinator", "coord5")

    response = client.get(_detail_url(order, line, "CARTON"))

    assert response.status_code == 200
    assert response.json()["required_qty"] == 1_000
    assert response.json()["id"] is None


def test_get_singleton_404_for_ineligible_line(order, piece_only_line):
    client = _client_as("Export Coordinator", "coord6")

    response = client.get(_detail_url(order, piece_only_line, "CARTON"))

    assert response.status_code == 404


def test_get_singleton_404_for_unknown_material_type(order, line):
    client = _client_as("Export Coordinator", "coord7")

    response = client.get(_detail_url(order, line, "NOT_A_TYPE"))

    assert response.status_code == 404


def test_patch_creates_row_on_first_save(order, line):
    client = _client_as("Export Coordinator", "coord8")

    response = client.patch(
        _detail_url(order, line, "CARTON"), {"available_stock": 600}, format="json"
    )

    assert response.status_code == 200, response.json()
    body = response.json()
    assert body["available_stock"] == 600
    assert body["shortage"] == 400
    requirement = PackingMaterialRequirement.objects.get(
        export_order_line=line, material_type="CARTON"
    )
    assert requirement.available_stock == 600


def test_patch_worked_example_shortage(order, line):
    client = _client_as("Export Coordinator", "coord9")

    response = client.patch(
        _detail_url(order, line, "CARTON"),
        {"available_stock": 600, "ordered_qty": 300, "status": "IN_PROGRESS"},
        format="json",
    )

    body = response.json()
    assert body["required_qty"] == 1_000
    assert body["available_stock"] == 600
    assert body["shortage"] == 400
    assert body["ordered_qty"] == 300
    assert body["status"] == "IN_PROGRESS"


def test_box_label_manual_required_qty_round_trips(order, line):
    client = _client_as("Export Coordinator", "coord10")

    response = client.patch(
        _detail_url(order, line, "BOX_LABEL"), {"manual_required_qty": 750}, format="json"
    )

    assert response.status_code == 200, response.json()
    assert response.json()["required_qty"] == 750


def test_manual_required_qty_rejected_for_computed_material_types(order, line):
    client = _client_as("Export Coordinator", "coord11")

    response = client.patch(
        _detail_url(order, line, "CARTON"), {"manual_required_qty": 750}, format="json"
    )

    assert response.status_code == 400
    assert "manual_required_qty" in response.json()


def test_manual_to_procure_qty_round_trips_and_overrides_shortage(order, line):
    """Procuring extra cartons to cover expected packing damage."""
    client = _client_as("Export Coordinator", "coord12")

    response = client.patch(
        _detail_url(order, line, "CARTON"),
        {"available_stock": 600, "manual_to_procure_qty": 500},
        format="json",
    )

    assert response.status_code == 200, response.json()
    body = response.json()
    assert body["shortage"] == 400
    assert body["to_procure_qty"] == 500
    assert body["manual_to_procure_qty"] == 500


def test_responsible_person_and_status_editable(organization, order, line):
    employee = Employee.objects.create(
        employee_code="E1", full_name="Asha Rao", organization=organization
    )
    client = _client_as("Manager/Admin", "mgr1")

    response = client.patch(
        _detail_url(order, line, "POUCH"),
        {"responsible_person": employee.id, "status": "READY"},
        format="json",
    )

    assert response.status_code == 200
    assert response.json()["responsible_person_detail"]["full_name"] == "Asha Rao"
    assert response.json()["status"] == "READY"
