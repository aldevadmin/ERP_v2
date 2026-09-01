import datetime

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework.test import APIClient

from apps.customer_mappings.models import (
    CustomerProductMapping,
    CustomerProductMappingVersion,
    MappingRequirement,
)
from apps.customers.models import Customer
from apps.items.models import UOM, Item
from apps.packaging.models import PackagingProfile, PackagingProfileVersion

pytestmark = pytest.mark.django_db

User = get_user_model()


def _client_as(role_name: str, username: str) -> APIClient:
    client = APIClient()
    user = User.objects.create_user(username=username, password="x")
    user.groups.add(Group.objects.get(name=role_name))
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def customer(organization) -> Customer:
    return Customer.objects.create(code="CUST-1", name="Acme Exports", organization=organization)


@pytest.fixture
def finished_item(organization) -> Item:
    return Item.objects.create(
        code="SQ10",
        name="10 Inch Plate",
        item_class=Item.ItemClass.FINISHED_GOOD,
        organization=organization,
    )


@pytest.fixture
def pc(organization) -> UOM:
    return UOM.objects.get(code="PC")


@pytest.fixture
def published_packaging_version(finished_item) -> PackagingProfileVersion:
    profile = PackagingProfile.objects.create(
        code="PKG-1",
        name="Standard Packing",
        finished_item=finished_item,
        organization=finished_item.organization,
    )
    return PackagingProfileVersion.objects.create(
        profile=profile,
        version_number=1,
        status=PackagingProfileVersion.Status.PUBLISHED,
        organization=finished_item.organization,
    )


def _mapping(customer, item, customer_sku="SKU-1") -> CustomerProductMapping:
    mapping = CustomerProductMapping.objects.create(
        customer=customer,
        item=item,
        customer_sku=customer_sku,
        mapping_code=f"CPM-{customer.id}-{customer_sku}",
        organization=item.organization,
    )
    CustomerProductMappingVersion.objects.create(
        mapping=mapping, version_number=1, organization=item.organization
    )
    return mapping


def test_create_mapping_creates_draft_v1(customer, finished_item):
    client = _client_as("Export Coordinator", "coord1")

    response = client.post(
        "/api/v1/customer-product-mappings/",
        {
            "customer": customer.id,
            "item": finished_item.id,
            "customer_sku": "SKU-1",
        },
        format="json",
    )

    assert response.status_code == 201
    body = response.json()
    assert body["mapping_code"] == f"{finished_item.code}-{customer.code}-SKU-1"
    assert body["current_version"]["version_number"] == 1
    assert body["current_version"]["status"] == "DRAFT"


def test_duplicate_sku_for_same_customer_rejected(customer, finished_item):
    _mapping(customer, finished_item, customer_sku="SKU-1")
    client = _client_as("Export Coordinator", "coord2")

    response = client.post(
        "/api/v1/customer-product-mappings/",
        {
            "customer": customer.id,
            "item": finished_item.id,
            "customer_sku": "SKU-1",
        },
        format="json",
    )

    assert response.status_code == 400


def test_same_customer_can_have_two_skus_for_same_item(customer, finished_item):
    """A customer can sell the same item under two different pack sizes as
    two distinct SKUs — the discriminator is `customer_sku`, not `item`."""
    _mapping(customer, finished_item, customer_sku="SKU-1")
    client = _client_as("Export Coordinator", "coord2b")

    response = client.post(
        "/api/v1/customer-product-mappings/",
        {
            "customer": customer.id,
            "item": finished_item.id,
            "customer_sku": "SKU-2",
        },
        format="json",
    )

    assert response.status_code == 201


def test_sku_cannot_be_changed_after_creation(customer, finished_item):
    mapping = _mapping(customer, finished_item, customer_sku="SKU-1")
    client = _client_as("Export Coordinator", "coord2c")

    response = client.patch(
        f"/api/v1/customer-product-mappings/{mapping.id}/",
        {"customer_sku": "SKU-2"},
        format="json",
    )

    assert response.status_code == 400


def test_requirements_whole_list_replace(customer, finished_item):
    mapping = _mapping(customer, finished_item)
    version = mapping.versions.get()
    client = _client_as("Export Coordinator", "coord3")

    response = client.patch(
        f"/api/v1/customer-product-mapping-versions/{version.id}/requirements/",
        {
            "requirements": [
                {
                    "category": "LABEL",
                    "key": "Retail Sticker",
                    "value": "Required",
                    "is_required": True,
                }
            ]
        },
        format="json",
    )

    assert response.status_code == 200
    assert version.requirements.count() == 1


def test_publish_requires_packaging_and_uom(customer, finished_item):
    mapping = _mapping(customer, finished_item)
    version = mapping.versions.get()
    client = _client_as("Export Coordinator", "coord4")

    response = client.post(f"/api/v1/customer-product-mapping-versions/{version.id}/publish/")

    assert response.status_code == 400


def test_publish_only_allows_published_packaging_profile_version(customer, finished_item, pc):
    mapping = _mapping(customer, finished_item)
    version = mapping.versions.get()
    profile = PackagingProfile.objects.create(
        code="PKG-2",
        name="Draft Packing",
        finished_item=finished_item,
        organization=finished_item.organization,
    )
    draft_packaging_version = PackagingProfileVersion.objects.create(
        profile=profile, version_number=1, organization=finished_item.organization
    )
    client = _client_as("Export Coordinator", "coord5")

    response = client.patch(
        f"/api/v1/customer-product-mapping-versions/{version.id}/",
        {
            "packaging_profile_version": draft_packaging_version.id,
            "selling_uom": pc.id,
        },
        format="json",
    )

    assert response.status_code == 400


def test_publish_succeeds_and_archives_prior_published(
    customer, finished_item, pc, published_packaging_version
):
    mapping = _mapping(customer, finished_item)
    version = mapping.versions.get()
    version.packaging_profile_version = published_packaging_version
    version.selling_uom = pc
    version.save()
    client = _client_as("Export Coordinator", "coord6")

    response = client.post(f"/api/v1/customer-product-mapping-versions/{version.id}/publish/")

    assert response.status_code == 200
    assert response.json()["status"] == "PUBLISHED"


def test_new_draft_clones_requirements(customer, finished_item, pc, published_packaging_version):
    mapping = _mapping(customer, finished_item)
    version = mapping.versions.get()
    version.packaging_profile_version = published_packaging_version
    version.selling_uom = pc
    version.status = CustomerProductMappingVersion.Status.PUBLISHED
    version.save()
    MappingRequirement.objects.create(
        version=version,
        category="LABEL",
        key="Retail Sticker",
        value="Required",
        organization=customer.organization,
    )
    client = _client_as("Export Coordinator", "coord7")

    response = client.post(f"/api/v1/customer-product-mapping-versions/{version.id}/new-draft/")

    assert response.status_code == 201
    body = response.json()
    assert body["version_number"] == 2
    assert body["status"] == "DRAFT"
    new_version = CustomerProductMappingVersion.objects.get(id=body["id"])
    assert new_version.requirements.count() == 1


def test_resolve_returns_effective_published_version(
    customer, finished_item, pc, published_packaging_version
):
    mapping = _mapping(customer, finished_item)
    version = mapping.versions.get()
    version.packaging_profile_version = published_packaging_version
    version.selling_uom = pc
    version.status = CustomerProductMappingVersion.Status.PUBLISHED
    version.save()
    client = _client_as("Export Coordinator", "coord8")

    response = client.get(
        "/api/v1/customer-product-mappings/resolve/",
        {"customer": customer.id, "customer_sku": "SKU-1"},
    )

    assert response.status_code == 200
    assert response.json()["customer_sku"] == "SKU-1"


def test_resolve_returns_404_when_no_published_mapping(customer, finished_item):
    _mapping(customer, finished_item)  # only a DRAFT version exists
    client = _client_as("Export Coordinator", "coord9")

    response = client.get(
        "/api/v1/customer-product-mappings/resolve/",
        {"customer": customer.id, "customer_sku": "SKU-1"},
    )

    assert response.status_code == 404


def test_resolve_respects_effective_date_range(
    customer, finished_item, pc, published_packaging_version
):
    mapping = _mapping(customer, finished_item)
    version = mapping.versions.get()
    version.packaging_profile_version = published_packaging_version
    version.selling_uom = pc
    version.status = CustomerProductMappingVersion.Status.PUBLISHED
    version.effective_from = datetime.date(2027, 1, 1)
    version.save()
    client = _client_as("Export Coordinator", "coord10")

    response = client.get(
        "/api/v1/customer-product-mappings/resolve/",
        {"customer": customer.id, "customer_sku": "SKU-1", "as_of": "2026-06-01"},
    )

    assert response.status_code == 404


def test_delete_unused_mapping_succeeds(customer, finished_item):
    mapping = _mapping(customer, finished_item)
    client = _client_as("Manager/Admin", "mgr1")

    response = client.delete(f"/api/v1/customer-product-mappings/{mapping.id}/")

    assert response.status_code == 204


def test_filters_by_packaging_profile(customer, finished_item, published_packaging_version):
    mapping = _mapping(customer, finished_item)
    version = mapping.versions.get()
    version.packaging_profile_version = published_packaging_version
    version.save()

    # A second, unrelated mapping (not pinned to this profile) — proves the
    # filter excludes it rather than just happening to return everything.
    other_item = Item.objects.create(
        code="OTHER-FG",
        name="Other Finished Good",
        item_class=Item.ItemClass.FINISHED_GOOD,
        organization=finished_item.organization,
    )
    _mapping(customer, other_item, customer_sku="SKU-2")
    client = _client_as("Export Coordinator", "coord-pkg1")

    response = client.get(
        f"/api/v1/customer-product-mappings/?packaging_profile={published_packaging_version.profile_id}"
    )

    assert response.status_code == 200
    body = response.json()
    assert body["count"] == 1
    assert body["results"][0]["id"] == mapping.id
