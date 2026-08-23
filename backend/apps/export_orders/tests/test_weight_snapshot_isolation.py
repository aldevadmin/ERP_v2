"""End-to-end regression: once an Export Order Line has snapshotted a
Customer Product Mapping version, republishing newer packaging/mapping
versions must never change that line's already-computed commercial facts
(AC-12, AC-13 in the Item/Packaging/Customer Mapping implementation guide).
"""

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework.test import APIClient

from apps.customer_mappings.models import CustomerProductMapping, CustomerProductMappingVersion
from apps.customers.models import Customer
from apps.export_orders.models import ExportOrder, ExportOrderLine, Shipment
from apps.items.models import UOM, Item
from apps.packaging.models import (
    PackagingProfile,
    PackagingProfileMaterial,
    PackagingProfileVersion,
)

pytestmark = pytest.mark.django_db

User = get_user_model()


def _client_as(role_name: str, username: str) -> APIClient:
    client = APIClient()
    user = User.objects.create_user(username=username, password="x")
    user.groups.add(Group.objects.get(name=role_name))
    client.force_authenticate(user=user)
    return client


def test_export_order_line_snapshots_mapping_version_and_survives_republish(organization):
    customer = Customer.objects.create(
        code="CUST-1", name="Acme Exports", organization=organization
    )
    item = Item.objects.create(
        code="SQ10",
        name="10 Inch Plate",
        item_class=Item.ItemClass.FINISHED_GOOD,
        organization=organization,
    )
    pc = UOM.objects.get(code="PC")

    profile = PackagingProfile.objects.create(
        code="PKG-1", name="Standard Packing", finished_item=item, organization=organization
    )
    packaging_v1 = PackagingProfileVersion.objects.create(
        profile=profile,
        version_number=1,
        status=PackagingProfileVersion.Status.PUBLISHED,
        selling_uom=pc,
        pack_mode=PackagingProfileVersion.PackMode.CARTON,
        pieces_per_pouch=10,
        pouches_per_carton=10,
        carton_net_weight_kg="5.00",
        carton_gross_weight_kg="6.00",
        pieces_per_selling_unit=100,
        organization=organization,
    )
    carton_item = Item.objects.create(
        code="CARTON-1",
        name="Standard Carton",
        item_class=Item.ItemClass.PACKAGING_MATERIAL,
        organization=organization,
    )
    PackagingProfileMaterial.objects.create(
        version=packaging_v1,
        item=carton_item,
        level="CARTON",
        quantity=1,
        uom=pc,
        organization=organization,
    )

    mapping = CustomerProductMapping.objects.create(
        customer=customer,
        item=item,
        customer_sku="SKU-A",
        mapping_code="CPM-1",
        organization=organization,
    )
    mapping_v1 = CustomerProductMappingVersion.objects.create(
        mapping=mapping,
        version_number=1,
        status=CustomerProductMappingVersion.Status.PUBLISHED,
        packaging_profile_version=packaging_v1,
        selling_uom=pc,
        organization=organization,
    )

    order = ExportOrder.objects.create(
        order_number="EO-2026-0001",
        customer=customer,
        customer_po_number="PO-1",
        customer_po_date="2026-01-01",
    )
    client = _client_as("Export Coordinator", "coord1")

    # Add the line through the real API so it goes through resolution +
    # snapshotting, not a direct ORM bypass.
    line_response = client.post(
        f"/api/v1/export-orders/{order.id}/lines/",
        {
            "customer_sku_code": "SKU-A",
            "item": item.id,
            "original_customer_quantity": 1000,
            "original_customer_unit": "PIECE",
        },
        format="json",
    )
    assert line_response.status_code == 201, line_response.json()
    assert line_response.json()["source_mapping_version"] == mapping_v1.id
    line = ExportOrderLine.objects.get(id=line_response.json()["id"])
    assert line.source_mapping_version_id == mapping_v1.id
    assert line.pieces_per_pouch == 10
    assert line.pouches_per_carton == 10

    shipment = Shipment.objects.create(shipment_number="EO-2026-0001-S01", export_order=order)
    shipment_line_response = client.post(
        f"/api/v1/export-orders/{order.id}/shipments/{shipment.id}/lines/",
        {"export_order_line": line.id, "planned_qty": 1000},
        format="json",
    )
    assert shipment_line_response.status_code == 201, shipment_line_response.json()
    shipment_line_id = shipment_line_response.json()["id"]

    load_response = client.post(
        f"/api/v1/export-orders/{order.id}/shipments/{shipment.id}/lines/{shipment_line_id}/"
        "loading-transactions/",
        {"date": "2026-01-06", "entry_type": "CARTON_LOADED", "cartons_loaded": 10},
        format="json",
    )
    assert load_response.status_code == 201, load_response.json()

    def _current_weights() -> tuple[float, float]:
        resp = client.get(
            f"/api/v1/export-orders/{order.id}/shipments/{shipment.id}/lines/{shipment_line_id}/"
        )
        return resp.json()["net_weight_kg"], resp.json()["gross_weight_kg"]

    net_before, gross_before = _current_weights()
    assert net_before == 50.0  # 10 cartons x 5.00 kg
    assert gross_before == 60.0  # 10 cartons x 6.00 kg

    # Now republish both packaging and mapping with materially different
    # weights — this must never retroactively change the already-placed
    # line above.
    packaging_v2 = client.post(
        f"/api/v1/packaging-profile-versions/{packaging_v1.id}/new-draft/"
    ).json()
    update_response = client.patch(
        f"/api/v1/packaging-profile-versions/{packaging_v2['id']}/",
        {"carton_net_weight_kg": 999, "carton_gross_weight_kg": 999},
        format="json",
    )
    assert update_response.status_code == 200, update_response.json()
    publish_packaging_response = client.post(
        f"/api/v1/packaging-profile-versions/{packaging_v2['id']}/publish/"
    )
    assert publish_packaging_response.status_code == 200, publish_packaging_response.json()

    mapping_v2 = client.post(
        f"/api/v1/customer-product-mapping-versions/{mapping_v1.id}/new-draft/"
    ).json()
    mapping_update_response = client.patch(
        f"/api/v1/customer-product-mapping-versions/{mapping_v2['id']}/",
        {"packaging_profile_version": packaging_v2["id"]},
        format="json",
    )
    assert mapping_update_response.status_code == 200, mapping_update_response.json()
    publish_mapping_response = client.post(
        f"/api/v1/customer-product-mapping-versions/{mapping_v2['id']}/publish/"
    )
    assert publish_mapping_response.status_code == 200, publish_mapping_response.json()

    # The live/current mapping now resolves to the new, heavier packaging —
    # confirms the republish actually took effect for *future* lookups.
    resolve_response = client.get(
        "/api/v1/customer-product-mappings/resolve/",
        {"customer": customer.id, "customer_sku": "SKU-A"},
    )
    assert resolve_response.status_code == 200
    assert resolve_response.json()["packaging_profile_version"] == packaging_v2["id"]

    # But the historical line's weight is untouched.
    net_after, gross_after = _current_weights()
    assert net_after == net_before == 50.0
    assert gross_after == gross_before == 60.0

    line.refresh_from_db()
    assert line.source_mapping_version_id == mapping_v1.id
