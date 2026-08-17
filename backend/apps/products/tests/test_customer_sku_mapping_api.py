import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework.test import APIClient

from apps.customers.models import Customer
from apps.products.models import CustomerSKUMapping, Product

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
def product(organization):
    return Product.objects.create(
        sku_code="SKU-1", name="Areca Plate", base_unit="Piece", organization=organization
    )


def test_list_requires_authentication():
    client = APIClient()

    response = client.get("/api/v1/customer-sku-mappings/")

    assert response.status_code == 403


def test_create_mapping(customer, product):
    client = _client_as("Export Coordinator", "coord1")

    response = client.post(
        "/api/v1/customer-sku-mappings/",
        {
            "customer": customer.id,
            "customer_sku_code": "PLATE-10SQ",
            "customer_description": "10 Inch Natural Square Plate",
            "product": product.id,
        },
        format="json",
    )

    assert response.status_code == 201
    body = response.json()
    assert body["customer_name"] == "Acme Exports"
    assert body["product_sku_code"] == "SKU-1"


def test_duplicate_customer_sku_code_rejected(customer, product):
    CustomerSKUMapping.objects.create(
        customer=customer, customer_sku_code="PLATE-10SQ", product=product
    )
    client = _client_as("Export Coordinator", "coord2")

    response = client.post(
        "/api/v1/customer-sku-mappings/",
        {"customer": customer.id, "customer_sku_code": "PLATE-10SQ", "product": product.id},
        format="json",
    )

    assert response.status_code == 400


def test_filter_by_customer(customer, product, organization):
    other_customer = Customer.objects.create(
        code="CUST-2", name="Other Co", organization=organization
    )
    CustomerSKUMapping.objects.create(
        customer=customer, customer_sku_code="A1", product=product
    )
    CustomerSKUMapping.objects.create(
        customer=other_customer, customer_sku_code="B1", product=product
    )
    client = _client_as("Export Coordinator", "coord3")

    response = client.get(f"/api/v1/customer-sku-mappings/?customer={customer.id}")

    results = response.json()["results"]
    assert len(results) == 1
    assert results[0]["customer_sku_code"] == "A1"


def test_delete_mapping(customer, product):
    mapping = CustomerSKUMapping.objects.create(
        customer=customer, customer_sku_code="A1", product=product
    )
    client = _client_as("Manager/Admin", "mgr1")

    response = client.delete(f"/api/v1/customer-sku-mappings/{mapping.id}/")

    assert response.status_code == 204
    assert not CustomerSKUMapping.objects.filter(id=mapping.id).exists()


def test_create_mapping_with_no_packing_config(customer, product):
    """Packing fields are optional — a mapping can exist without any of them."""
    client = _client_as("Export Coordinator", "coord4")

    response = client.post(
        "/api/v1/customer-sku-mappings/",
        {"customer": customer.id, "customer_sku_code": "A1", "product": product.id},
        format="json",
    )

    assert response.status_code == 201
    body = response.json()
    assert body["pieces_per_pouch"] is None
    assert body["pieces_per_carton"] is None
    assert body["has_retail_sticker"] is None


def test_create_mapping_with_packing_config(customer, product):
    client = _client_as("Export Coordinator", "coord5")

    response = client.post(
        "/api/v1/customer-sku-mappings/",
        {
            "customer": customer.id,
            "customer_sku_code": "PLATE-10SQ",
            "product": product.id,
            "pieces_per_pouch": 25,
            "pouches_per_carton": 20,
            "pouch_height_inches": "3.50",
            "carton_ply_rating": "5_PLY",
            "carton_length_mm": "600.00",
            "carton_breadth_mm": "400.00",
            "carton_height_mm": "400.00",
            "carton_net_weight_kg": "18.50",
            "carton_gross_weight_kg": "20.00",
            "pouch_thickness_microns": "60.00",
            "pouch_length_mm": "150.00",
            "pouch_breadth_mm": "100.00",
            "pouch_height_mm": "5.00",
            "has_retail_sticker": True,
            "retail_sticker_comments": "1 per pouch, customer logo",
            "has_silica_gel": True,
            "other_packing_requirements": "Shrink wrap pallet before loading",
        },
        format="json",
    )

    assert response.status_code == 201
    body = response.json()
    # 25 pieces/pouch x 20 pouches/carton — computed, not sent by the client.
    assert body["pieces_per_carton"] == 500
    assert body["carton_ply_rating"] == "5_PLY"
    assert body["has_retail_sticker"] is True
    assert body["retail_sticker_comments"] == "1 per pouch, customer logo"
    assert body["has_silica_gel"] is True


def test_pieces_per_carton_is_null_when_inputs_incomplete(customer, product):
    mapping = CustomerSKUMapping.objects.create(
        customer=customer, customer_sku_code="A1", product=product, pieces_per_pouch=25
    )
    client = _client_as("Export Coordinator", "coord6")

    response = client.get(f"/api/v1/customer-sku-mappings/{mapping.id}/")

    assert response.json()["pieces_per_carton"] is None


def test_update_packing_config(customer, product):
    mapping = CustomerSKUMapping.objects.create(
        customer=customer,
        customer_sku_code="A1",
        product=product,
        pieces_per_pouch=25,
        pouches_per_carton=20,
    )
    client = _client_as("Manager/Admin", "mgr2")

    response = client.patch(
        f"/api/v1/customer-sku-mappings/{mapping.id}/",
        {"pouches_per_carton": 24},
        format="json",
    )

    assert response.status_code == 200
    assert response.json()["pieces_per_carton"] == 600
    mapping.refresh_from_db()
    assert mapping.pouches_per_carton == 24
