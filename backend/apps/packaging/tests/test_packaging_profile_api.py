import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework.test import APIClient

from apps.customer_mappings.models import CustomerProductMapping, CustomerProductMappingVersion
from apps.customers.models import Customer
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


@pytest.fixture
def finished_item(organization) -> Item:
    return Item.objects.create(
        code="SQ10",
        name="10 Inch Plate",
        item_class=Item.ItemClass.FINISHED_GOOD,
        organization=organization,
    )


@pytest.fixture
def pouch_item(organization) -> Item:
    return Item.objects.create(
        code="POUCH-1",
        name="Standard Pouch",
        item_class=Item.ItemClass.PACKAGING_MATERIAL,
        organization=organization,
    )


@pytest.fixture
def pc(organization) -> UOM:
    return UOM.objects.get(code="PC")


def _profile(finished_item) -> PackagingProfile:
    profile = PackagingProfile.objects.create(
        code="PKG-1",
        name="Standard Packing",
        finished_item=finished_item,
        organization=finished_item.organization,
    )
    PackagingProfileVersion.objects.create(
        profile=profile, version_number=1, organization=finished_item.organization
    )
    return profile


def test_create_profile_creates_draft_v1(finished_item):
    client = _client_as("Export Coordinator", "coord1")

    response = client.post(
        "/api/v1/packaging-profiles/",
        {"code": "PKG-1", "name": "Standard Packing", "finished_item": finished_item.id},
        format="json",
    )

    assert response.status_code == 201
    body = response.json()
    assert body["current_version"]["version_number"] == 1
    assert body["current_version"]["status"] == "DRAFT"


def test_materials_whole_list_replace(finished_item, pouch_item, pc):
    profile = _profile(finished_item)
    version = profile.versions.get()
    client = _client_as("Export Coordinator", "coord2")

    response = client.patch(
        f"/api/v1/packaging-profile-versions/{version.id}/materials/",
        {
            "materials": [
                {"item": pouch_item.id, "level": "POUCH", "quantity": "1.000", "uom": pc.id}
            ]
        },
        format="json",
    )

    assert response.status_code == 200
    assert version.materials.count() == 1


def test_publish_requires_selling_uom_and_materials(finished_item):
    profile = _profile(finished_item)
    version = profile.versions.get()
    client = _client_as("Export Coordinator", "coord3")

    response = client.post(f"/api/v1/packaging-profile-versions/{version.id}/publish/")

    assert response.status_code == 400


def test_publish_succeeds_and_computes_derived_fields(finished_item, pouch_item, pc):
    profile = _profile(finished_item)
    version = profile.versions.get()
    version.selling_uom = pc
    version.pack_mode = PackagingProfileVersion.PackMode.CARTON
    version.pieces_per_pouch = 25
    version.pouches_per_carton = 4
    version.carton_length_mm = 100
    version.carton_breadth_mm = 200
    version.carton_height_mm = 100
    version.save()
    PackagingProfileMaterial.objects.create(
        version=version,
        item=pouch_item,
        level="POUCH",
        quantity=1,
        uom=pc,
        organization=finished_item.organization,
    )
    client = _client_as("Export Coordinator", "coord4")

    response = client.post(f"/api/v1/packaging-profile-versions/{version.id}/publish/")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "PUBLISHED"
    assert body["pieces_per_selling_unit"] == 100
    assert body["cbm"] == "0.0020"


def test_edit_blocked_on_non_draft(finished_item):
    profile = _profile(finished_item)
    version = profile.versions.get()
    version.status = PackagingProfileVersion.Status.PUBLISHED
    version.save()
    client = _client_as("Export Coordinator", "coord5")

    response = client.patch(
        f"/api/v1/packaging-profile-versions/{version.id}/", {"pieces_per_pouch": 5}, format="json"
    )

    assert response.status_code == 400


def test_new_draft_clones_published_version(finished_item, pouch_item, pc):
    profile = _profile(finished_item)
    version = profile.versions.get()
    version.status = PackagingProfileVersion.Status.PUBLISHED
    version.selling_uom = pc
    version.pieces_per_pouch = 25
    version.save()
    PackagingProfileMaterial.objects.create(
        version=version,
        item=pouch_item,
        level="POUCH",
        quantity=1,
        uom=pc,
        organization=finished_item.organization,
    )
    client = _client_as("Export Coordinator", "coord6")

    response = client.post(f"/api/v1/packaging-profile-versions/{version.id}/new-draft/")

    assert response.status_code == 201
    body = response.json()
    assert body["version_number"] == 2
    assert body["status"] == "DRAFT"
    assert body["pieces_per_pouch"] == 25
    new_version = PackagingProfileVersion.objects.get(id=body["id"])
    assert new_version.materials.count() == 1


def test_delete_profile_used_by_published_mapping_is_blocked(finished_item, organization):
    profile = _profile(finished_item)
    version = profile.versions.get()
    version.status = PackagingProfileVersion.Status.PUBLISHED
    version.save()
    customer = Customer.objects.create(code="CUST-1", name="Acme", organization=organization)
    mapping = CustomerProductMapping.objects.create(
        customer=customer,
        item=finished_item,
        customer_sku="SKU-1",
        mapping_code="CPM-1",
        organization=organization,
    )
    CustomerProductMappingVersion.objects.create(
        mapping=mapping,
        version_number=1,
        packaging_profile_version=version,
        organization=organization,
    )
    client = _client_as("Manager/Admin", "mgr1")

    response = client.delete(f"/api/v1/packaging-profiles/{profile.id}/")

    assert response.status_code == 400
