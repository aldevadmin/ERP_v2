import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from apps.accounts.models import Employee
from apps.customers.models import Customer, CustomerAddress
from apps.export_orders.models import ExportOrder

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


def test_create_requires_only_the_minimal_fields(customer):
    client = _client_as("Export Coordinator", "coord1")

    response = client.post(
        "/api/v1/export-orders/",
        {
            "customer": customer.id,
            "customer_po_number": "PO-100",
            "customer_po_date": "2026-01-15",
        },
        format="json",
    )

    assert response.status_code == 201
    body = response.json()
    assert body["order_number"].startswith("EO-")
    assert body["status"] == "PLANNING"
    assert body["customer_name"] == "Acme Exports"


def test_order_numbers_increment(customer):
    client = _client_as("Export Coordinator", "coord2")
    payload = {
        "customer": customer.id,
        "customer_po_number": "PO-1",
        "customer_po_date": "2026-01-01",
    }

    first = client.post("/api/v1/export-orders/", payload, format="json")
    second = client.post("/api/v1/export-orders/", payload, format="json")

    assert first.json()["order_number"] != second.json()["order_number"]


def test_export_coordinator_defaults_to_the_creating_user(customer, organization):
    user = User.objects.create_user(username="coord3", password="x")
    user.groups.add(Group.objects.get(name="Export Coordinator"))
    Employee.objects.create(
        user=user, employee_code="EMP1", full_name="Coord Person", organization=organization
    )
    client = APIClient()
    client.force_authenticate(user=user)

    response = client.post(
        "/api/v1/export-orders/",
        {"customer": customer.id, "customer_po_number": "PO-1", "customer_po_date": "2026-01-01"},
        format="json",
    )

    assert response.json()["export_coordinator_detail"]["full_name"] == "Coord Person"


def test_update_details(customer):
    order = ExportOrder.objects.create(
        order_number="EO-2026-0099",
        customer=customer,
        customer_po_number="PO-1",
        customer_po_date="2026-01-01",
    )
    client = _client_as("Manager/Admin", "mgr1")

    response = client.patch(
        f"/api/v1/export-orders/{order.id}/",
        {"destination_port": "Chennai", "incoterm": "FOB", "currency": "usd"},
        format="json",
    )

    assert response.status_code == 200
    body = response.json()
    assert body["destination_port"] == "Chennai"
    assert body["currency"] == "USD"


def test_bill_to_must_belong_to_the_order_customer(customer, organization):
    other_customer = Customer.objects.create(
        code="CUST-2", name="Other Co", organization=organization
    )
    other_address = CustomerAddress.objects.create(
        customer=other_customer,
        address_type=CustomerAddress.AddressType.BILLING,
        line1="X",
        country="USA",
    )
    order = ExportOrder.objects.create(
        order_number="EO-2026-0098",
        customer=customer,
        customer_po_number="PO-1",
        customer_po_date="2026-01-01",
    )
    client = _client_as("Manager/Admin", "mgr2")

    response = client.patch(
        f"/api/v1/export-orders/{order.id}/", {"bill_to": other_address.id}, format="json"
    )

    assert response.status_code == 400


def test_status_is_not_directly_editable(customer):
    order = ExportOrder.objects.create(
        order_number="EO-2026-0097",
        customer=customer,
        customer_po_number="PO-1",
        customer_po_date="2026-01-01",
    )
    client = _client_as("Manager/Admin", "mgr3")

    response = client.patch(
        f"/api/v1/export-orders/{order.id}/", {"status": "SHIPPED"}, format="json"
    )

    assert response.status_code == 200
    order.refresh_from_db()
    assert order.status == ExportOrder.Status.PLANNING


def test_cancel_order(customer):
    order = ExportOrder.objects.create(
        order_number="EO-2026-0096",
        customer=customer,
        customer_po_number="PO-1",
        customer_po_date="2026-01-01",
    )
    client = _client_as("Export Coordinator", "coord4")

    response = client.post(f"/api/v1/export-orders/{order.id}/cancel/")

    assert response.status_code == 200
    assert response.json()["status"] == "CANCELLED"


def test_cancel_twice_is_rejected(customer):
    order = ExportOrder.objects.create(
        order_number="EO-2026-0095",
        customer=customer,
        customer_po_number="PO-1",
        customer_po_date="2026-01-01",
        status=ExportOrder.Status.CANCELLED,
    )
    client = _client_as("Export Coordinator", "coord5")

    response = client.post(f"/api/v1/export-orders/{order.id}/cancel/")

    assert response.status_code == 400


def test_upload_po_version(customer):
    order = ExportOrder.objects.create(
        order_number="EO-2026-0094",
        customer=customer,
        customer_po_number="PO-1",
        customer_po_date="2026-01-01",
    )
    client = _client_as("Export Coordinator", "coord6")
    upload = SimpleUploadedFile("po.pdf", b"file-bytes", content_type="application/pdf")

    response = client.post(
        f"/api/v1/export-orders/{order.id}/po-versions/",
        {"document": upload, "remarks": "Initial PO"},
        format="multipart",
    )

    assert response.status_code == 201
    body = response.json()
    assert body["version_number"] == 1
    assert body["is_current"] is True


def test_second_po_version_becomes_current(customer):
    order = ExportOrder.objects.create(
        order_number="EO-2026-0093",
        customer=customer,
        customer_po_number="PO-1",
        customer_po_date="2026-01-01",
    )
    client = _client_as("Export Coordinator", "coord7")

    first = SimpleUploadedFile("po1.pdf", b"v1", content_type="application/pdf")
    client.post(
        f"/api/v1/export-orders/{order.id}/po-versions/", {"document": first}, format="multipart"
    )

    second = SimpleUploadedFile("po2.pdf", b"v2", content_type="application/pdf")
    response = client.post(
        f"/api/v1/export-orders/{order.id}/po-versions/",
        {"document": second, "remarks": "Revised quantities"},
        format="multipart",
    )

    assert response.status_code == 201
    assert response.json()["version_number"] == 2

    detail = client.get(f"/api/v1/export-orders/{order.id}/")
    versions = detail.json()["po_versions"]
    assert len(versions) == 2
    current = [v for v in versions if v["is_current"]]
    assert len(current) == 1
    assert current[0]["version_number"] == 2


def test_search_by_order_number(customer):
    ExportOrder.objects.create(
        order_number="EO-2026-0001",
        customer=customer,
        customer_po_number="ABC",
        customer_po_date="2026-01-01",
    )
    ExportOrder.objects.create(
        order_number="EO-2026-0002",
        customer=customer,
        customer_po_number="XYZ",
        customer_po_date="2026-01-01",
    )
    client = _client_as("Export Coordinator", "coord8")

    response = client.get("/api/v1/export-orders/?search=0001")

    results = response.json()["results"]
    assert len(results) == 1
    assert results[0]["order_number"] == "EO-2026-0001"


def test_filter_by_status(customer):
    ExportOrder.objects.create(
        order_number="EO-2026-0001",
        customer=customer,
        customer_po_number="ABC",
        customer_po_date="2026-01-01",
        status=ExportOrder.Status.CANCELLED,
    )
    ExportOrder.objects.create(
        order_number="EO-2026-0002",
        customer=customer,
        customer_po_number="XYZ",
        customer_po_date="2026-01-01",
    )
    client = _client_as("Export Coordinator", "coord9")

    response = client.get("/api/v1/export-orders/?status=CANCELLED")

    results = response.json()["results"]
    assert len(results) == 1
    assert results[0]["order_number"] == "EO-2026-0001"


def test_list_includes_customer_po_date_and_container_type(customer):
    from apps.export_orders.models import Shipment

    order = ExportOrder.objects.create(
        order_number="EO-2026-0001",
        customer=customer,
        customer_po_number="ABC",
        customer_po_date="2026-01-01",
    )
    Shipment.objects.create(
        shipment_number="EO-2026-0001-S01", export_order=order, planned_container_type="40ft HC"
    )
    client = _client_as("Export Coordinator", "coord10")

    response = client.get("/api/v1/export-orders/")

    result = response.json()["results"][0]
    assert result["customer_po_date"] == "2026-01-01"
    assert result["container_type"] == "40ft HC"


def test_list_container_type_is_none_without_a_shipment(customer):
    ExportOrder.objects.create(
        order_number="EO-2026-0001",
        customer=customer,
        customer_po_number="ABC",
        customer_po_date="2026-01-01",
    )
    client = _client_as("Export Coordinator", "coord11")

    response = client.get("/api/v1/export-orders/")

    assert response.json()["results"][0]["container_type"] is None


def test_filter_by_crd_range(customer):
    ExportOrder.objects.create(
        order_number="EO-2026-0001",
        customer=customer,
        customer_po_number="ABC",
        customer_po_date="2026-01-01",
        planned_container_ready_date="2026-02-01",
    )
    ExportOrder.objects.create(
        order_number="EO-2026-0002",
        customer=customer,
        customer_po_number="XYZ",
        customer_po_date="2026-01-01",
        planned_container_ready_date="2026-03-15",
    )
    client = _client_as("Export Coordinator", "coord12")

    response = client.get(
        "/api/v1/export-orders/?crd_from=2026-02-15&crd_to=2026-03-31"
    )

    results = response.json()["results"]
    assert len(results) == 1
    assert results[0]["order_number"] == "EO-2026-0002"


def test_create_seeds_a_planning_stage_event(customer):
    from apps.export_orders.models import ExportOrderStageEvent

    client = _client_as("Export Coordinator", "coord13")

    response = client.post(
        "/api/v1/export-orders/",
        {"customer": customer.id, "customer_po_number": "PO-1", "customer_po_date": "2026-01-01"},
        format="json",
    )

    order_id = response.json()["id"]
    events = ExportOrderStageEvent.objects.filter(export_order_id=order_id)
    assert events.count() == 1
    assert events.first().status == "PLANNING"


def test_advance_moves_to_the_next_stage_and_logs_an_event(customer):
    from apps.export_orders.models import ExportOrderStageEvent

    order = ExportOrder.objects.create(
        order_number="EO-2026-0090",
        customer=customer,
        customer_po_number="PO-1",
        customer_po_date="2026-01-01",
    )
    client = _client_as("Export Coordinator", "coord14")

    response = client.post(f"/api/v1/export-orders/{order.id}/advance/")

    assert response.status_code == 200
    assert response.json()["status"] == "FULFILMENT"
    assert ExportOrderStageEvent.objects.filter(
        export_order=order, status="FULFILMENT"
    ).exists()


def test_advance_walks_the_full_sequence(customer):
    order = ExportOrder.objects.create(
        order_number="EO-2026-0091",
        customer=customer,
        customer_po_number="PO-1",
        customer_po_date="2026-01-01",
    )
    client = _client_as("Export Coordinator", "coord15")

    expected = ["FULFILMENT", "PACKING", "LOADING", "SHIPPED", "COMPLETE"]
    for expected_status in expected:
        response = client.post(f"/api/v1/export-orders/{order.id}/advance/")
        assert response.json()["status"] == expected_status

    final_response = client.post(f"/api/v1/export-orders/{order.id}/advance/")
    assert final_response.status_code == 400


def test_advance_cancelled_order_is_rejected(customer):
    order = ExportOrder.objects.create(
        order_number="EO-2026-0092",
        customer=customer,
        customer_po_number="PO-1",
        customer_po_date="2026-01-01",
        status=ExportOrder.Status.CANCELLED,
    )
    client = _client_as("Export Coordinator", "coord16")

    response = client.post(f"/api/v1/export-orders/{order.id}/advance/")

    assert response.status_code == 400


def test_stage_history_reflects_progress(customer):
    client = _client_as("Export Coordinator", "coord17")
    create_response = client.post(
        "/api/v1/export-orders/",
        {"customer": customer.id, "customer_po_number": "PO-1", "customer_po_date": "2026-01-01"},
        format="json",
    )
    order_id = create_response.json()["id"]

    client.post(f"/api/v1/export-orders/{order_id}/advance/")

    detail = client.get(f"/api/v1/export-orders/{order_id}/").json()
    history = {entry["status"]: entry for entry in detail["stage_history"]}

    assert history["PLANNING"]["state"] == "COMPLETED"
    assert history["PLANNING"]["entered_at"] is not None
    assert history["PLANNING"]["completed_at"] is not None
    assert history["FULFILMENT"]["state"] == "IN_PROGRESS"
    assert history["FULFILMENT"]["entered_at"] is not None
    assert history["FULFILMENT"]["completed_at"] is None
    assert history["PACKING"]["state"] == "PENDING"
    assert history["PACKING"]["entered_at"] is None


def test_list_and_create_notes(customer):
    order = ExportOrder.objects.create(
        order_number="EO-2026-0093",
        customer=customer,
        customer_po_number="PO-1",
        customer_po_date="2026-01-01",
    )
    client = _client_as("Export Coordinator", "coord18")

    create_response = client.post(
        f"/api/v1/export-orders/{order.id}/notes/",
        {"text": "Packing in progress."},
        format="json",
    )
    list_response = client.get(f"/api/v1/export-orders/{order.id}/notes/")

    assert create_response.status_code == 201
    assert create_response.json()["author"] == "coord18"
    results = list_response.json()["results"]
    assert len(results) == 1
    assert results[0]["text"] == "Packing in progress."


def test_note_text_cannot_be_blank(customer):
    order = ExportOrder.objects.create(
        order_number="EO-2026-0094",
        customer=customer,
        customer_po_number="PO-1",
        customer_po_date="2026-01-01",
    )
    client = _client_as("Export Coordinator", "coord19")

    response = client.post(
        f"/api/v1/export-orders/{order.id}/notes/", {"text": "   "}, format="json"
    )

    assert response.status_code == 400


def test_detail_includes_container_type(customer):
    from apps.export_orders.models import Shipment

    order = ExportOrder.objects.create(
        order_number="EO-2026-0097",
        customer=customer,
        customer_po_number="PO-1",
        customer_po_date="2026-01-01",
    )
    Shipment.objects.create(
        shipment_number="EO-2026-0097-S01", export_order=order, planned_container_type="20ft"
    )
    client = _client_as("Export Coordinator", "coord20")

    response = client.get(f"/api/v1/export-orders/{order.id}/")

    assert response.json()["container_type"] == "20ft"


def test_no_delete_route(customer):
    order = ExportOrder.objects.create(
        order_number="EO-2026-0001",
        customer=customer,
        customer_po_number="ABC",
        customer_po_date="2026-01-01",
    )
    client = _client_as("Manager/Admin", "mgr4")

    response = client.delete(f"/api/v1/export-orders/{order.id}/")

    assert response.status_code == 405
