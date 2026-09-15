import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework.test import APIClient

from apps.items.models import ItemGroup
from apps.processes.models import OutputClassification, ProcessCategory
from apps.processes_v1.models import ProcessDefinitionV1, ProcessDefinitionVersionV1

pytestmark = pytest.mark.django_db

User = get_user_model()


def _client_as(role_name: str, username: str) -> APIClient:
    client = APIClient()
    user = User.objects.create_user(username=username, password="x")
    user.groups.add(Group.objects.get(name=role_name))
    client.force_authenticate(user=user)
    return client


def _category(organization, name: str = "Production") -> ProcessCategory:
    return ProcessCategory.objects.create(name=name, organization=organization)


def _item_group(organization, name: str) -> ItemGroup:
    return ItemGroup.objects.create(name=name, organization=organization)


# ---------------------------------------------------------------------------
# Definition CRUD
# ---------------------------------------------------------------------------


def test_list_requires_authentication():
    client = APIClient()

    response = client.get("/api/v1/process-definitions-v1/")

    assert response.status_code == 403


def test_create_creates_definition_and_version_1_together(organization):
    category = _category(organization)
    client = _client_as("Export Coordinator", "coord1")

    response = client.post(
        "/api/v1/process-definitions-v1/",
        {"name": "Pressing", "code": "PRESS", "category": category.id, "description": "Presses."},
        format="json",
    )

    assert response.status_code == 201
    definition = ProcessDefinitionV1.objects.get(code="PRESS")
    assert definition.organization_id is not None
    version = definition.current_version()
    assert version is not None
    assert version.version_number == 1
    assert version.status == ProcessDefinitionVersionV1.Status.DRAFT
    assert version.category_id == category.id
    assert version.description == "Presses."


def test_create_rejects_duplicate_code(organization):
    ProcessDefinitionV1.objects.create(name="Washing", code="WASH", organization=organization)
    category = _category(organization)
    client = _client_as("Export Coordinator", "coord2")

    response = client.post(
        "/api/v1/process-definitions-v1/",
        {"name": "Other", "code": "WASH", "category": category.id},
        format="json",
    )

    assert response.status_code == 400


def test_create_forbidden_for_non_manager(organization):
    _category(organization)
    client = _client_as("Packing Coordinator", "coord3")

    response = client.post(
        "/api/v1/process-definitions-v1/", {"name": "Washing", "code": "WASH2"}, format="json"
    )

    assert response.status_code == 403


def test_duplicate_copies_version_inputs_and_outputs(organization):
    category = _category(organization)
    unsorted = _item_group(organization, "WIP - Unsorted Plate")
    good = _item_group(organization, "WIP - Sorted Plate - Good")
    classification = OutputClassification.objects.get(name="Good")
    definition = ProcessDefinitionV1.objects.create(
        name="Sorting", code="SORT", organization=organization
    )
    version = ProcessDefinitionVersionV1.objects.create(
        process_definition=definition, version_number=1, category=category, organization=organization
    )
    client = _client_as("Export Coordinator", "coord4")
    client.patch(
        f"/api/v1/process-definition-versions-v1/{version.id}/inputs/",
        {"inputs": [{"item_group": unsorted.id, "uom": "PC", "is_required": True}]},
        format="json",
    )
    client.patch(
        f"/api/v1/process-definition-versions-v1/{version.id}/outputs/",
        {
            "outputs": [
                {"item_group": good.id, "classification": classification.id, "uom": "PC"}
            ]
        },
        format="json",
    )

    response = client.post(f"/api/v1/process-definitions-v1/{definition.id}/duplicate/")

    assert response.status_code == 201
    copy_id = response.json()["id"]
    copy = ProcessDefinitionV1.objects.get(id=copy_id)
    assert copy.code == "SORT-COPY"
    copy_version = copy.current_version()
    assert copy_version is not None
    assert copy_version.inputs.count() == 1
    assert copy_version.inputs.first().item_group_id == unsorted.id
    assert copy_version.outputs.count() == 1
    assert copy_version.outputs.first().item_group_id == good.id


# ---------------------------------------------------------------------------
# Inputs / Outputs whole-list-replace
# ---------------------------------------------------------------------------


def test_inputs_whole_list_replace_reorders_without_collision(organization):
    category = _category(organization)
    group_a = _item_group(organization, "Group A")
    group_b = _item_group(organization, "Group B")
    definition = ProcessDefinitionV1.objects.create(
        name="Trimming", code="TRIM", organization=organization
    )
    version = ProcessDefinitionVersionV1.objects.create(
        process_definition=definition, version_number=1, category=category, organization=organization
    )
    client = _client_as("Export Coordinator", "coord5")
    client.patch(
        f"/api/v1/process-definition-versions-v1/{version.id}/inputs/",
        {
            "inputs": [
                {"item_group": group_a.id, "uom": "PC"},
                {"item_group": group_b.id, "uom": "PC"},
            ]
        },
        format="json",
    )
    row_a_id = version.inputs.get(item_group=group_a).id
    row_b_id = version.inputs.get(item_group=group_b).id

    response = client.patch(
        f"/api/v1/process-definition-versions-v1/{version.id}/inputs/",
        {
            "inputs": [
                {"id": row_b_id, "item_group": group_b.id, "uom": "PC"},
                {"id": row_a_id, "item_group": group_a.id, "uom": "PC"},
            ]
        },
        format="json",
    )

    assert response.status_code == 200
    version.refresh_from_db()
    ordered = list(version.inputs.order_by("sequence").values_list("item_group_id", flat=True))
    assert ordered == [group_b.id, group_a.id]


def test_inputs_rejects_unknown_item_group(organization):
    category = _category(organization)
    definition = ProcessDefinitionV1.objects.create(
        name="Trimming", code="TRIM2", organization=organization
    )
    version = ProcessDefinitionVersionV1.objects.create(
        process_definition=definition, version_number=1, category=category, organization=organization
    )
    client = _client_as("Export Coordinator", "coord6")

    response = client.patch(
        f"/api/v1/process-definition-versions-v1/{version.id}/inputs/",
        {"inputs": [{"item_group": 999999, "uom": "PC"}]},
        format="json",
    )

    assert response.status_code == 400


def test_outputs_classification_is_optional(organization):
    category = _category(organization)
    group = _item_group(organization, "Reject Plate")
    definition = ProcessDefinitionV1.objects.create(
        name="Grading", code="GRADE", organization=organization
    )
    version = ProcessDefinitionVersionV1.objects.create(
        process_definition=definition, version_number=1, category=category, organization=organization
    )
    client = _client_as("Export Coordinator", "coord7")

    response = client.patch(
        f"/api/v1/process-definition-versions-v1/{version.id}/outputs/",
        {"outputs": [{"item_group": group.id, "uom": "PC"}]},
        format="json",
    )

    assert response.status_code == 200
    version.refresh_from_db()
    assert version.outputs.first().classification_id is None


def test_only_draft_version_can_be_edited(organization):
    category = _category(organization)
    group = _item_group(organization, "Group")
    definition = ProcessDefinitionV1.objects.create(
        name="Washing", code="WASH3", organization=organization
    )
    version = ProcessDefinitionVersionV1.objects.create(
        process_definition=definition,
        version_number=1,
        category=category,
        status=ProcessDefinitionVersionV1.Status.ACTIVE,
        organization=organization,
    )
    client = _client_as("Export Coordinator", "coord8")

    response = client.patch(
        f"/api/v1/process-definition-versions-v1/{version.id}/inputs/",
        {"inputs": [{"item_group": group.id, "uom": "PC"}]},
        format="json",
    )

    assert response.status_code == 400


# ---------------------------------------------------------------------------
# Activation
# ---------------------------------------------------------------------------


def test_activate_requires_at_least_one_output(organization):
    category = _category(organization)
    definition = ProcessDefinitionV1.objects.create(
        name="Boxing", code="BOX", organization=organization
    )
    version = ProcessDefinitionVersionV1.objects.create(
        process_definition=definition, version_number=1, category=category, organization=organization
    )
    client = _client_as("Export Coordinator", "coord9")

    response = client.post(f"/api/v1/process-definition-versions-v1/{version.id}/activate/")

    assert response.status_code == 400


def test_activate_archives_previous_active_version(organization):
    category = _category(organization)
    group = _item_group(organization, "Group")
    definition = ProcessDefinitionV1.objects.create(
        name="Boxing", code="BOX2", organization=organization
    )
    old_active = ProcessDefinitionVersionV1.objects.create(
        process_definition=definition,
        version_number=1,
        category=category,
        status=ProcessDefinitionVersionV1.Status.ACTIVE,
        organization=organization,
    )
    new_version = ProcessDefinitionVersionV1.objects.create(
        process_definition=definition, version_number=2, category=category, organization=organization
    )
    from apps.processes_v1.models import ProcessOutputDefinitionV1

    ProcessOutputDefinitionV1.objects.create(
        process_version=new_version, sequence=1, item_group=group, uom="PC", organization=organization
    )
    client = _client_as("Export Coordinator", "coord10")

    response = client.post(f"/api/v1/process-definition-versions-v1/{new_version.id}/activate/")

    assert response.status_code == 200
    old_active.refresh_from_db()
    new_version.refresh_from_db()
    assert old_active.status == ProcessDefinitionVersionV1.Status.ARCHIVED
    assert new_version.status == ProcessDefinitionVersionV1.Status.ACTIVE
