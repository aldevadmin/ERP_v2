import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework.test import APIClient

from apps.processes.models import ProcessCategory, ProcessDefinition, ProcessDefinitionVersion

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


def test_list_requires_authentication():
    client = APIClient()

    response = client.get("/api/v1/process-definitions/")

    assert response.status_code == 403


def test_create_creates_definition_and_version_1_together(organization):
    category = _category(organization)
    client = _client_as("Export Coordinator", "coord1")

    response = client.post(
        "/api/v1/process-definitions/",
        {
            "name": "Pressing",
            "code": "PRESS",
            "category": category.id,
            "description": "Presses leaf.",
        },
        format="json",
    )

    assert response.status_code == 201
    definition = ProcessDefinition.objects.get(code="PRESS")
    assert definition.organization_id is not None  # auto-defaulted, never sent by the client
    version = definition.current_version()
    assert version is not None
    assert version.version_number == 1
    assert version.status == ProcessDefinitionVersion.Status.DRAFT
    assert version.category_id == category.id
    assert version.description == "Presses leaf."


def test_create_requires_category(organization):
    client = _client_as("Export Coordinator", "coord2")

    response = client.post(
        "/api/v1/process-definitions/", {"name": "Pressing", "code": "PRESS2"}, format="json"
    )

    assert response.status_code == 400


def test_create_rejects_duplicate_code(organization):
    ProcessDefinition.objects.create(name="Washing", code="WASH", organization=organization)
    category = _category(organization)
    client = _client_as("Export Coordinator", "coord3")

    response = client.post(
        "/api/v1/process-definitions/",
        {"name": "Other", "code": "WASH", "category": category.id},
        format="json",
    )

    assert response.status_code == 400


def test_list_returns_current_version_summary(organization):
    category = _category(organization)
    definition = ProcessDefinition.objects.create(
        name="Washing", code="WASH", organization=organization
    )
    ProcessDefinitionVersion.objects.create(
        process_definition=definition,
        version_number=1,
        category=category,
        organization=organization,
    )
    client = _client_as("Export Coordinator", "coord4")

    response = client.get("/api/v1/process-definitions/")

    assert response.status_code == 200
    result = response.json()["results"][0]
    assert result["name"] == "Washing"
    assert result["code"] == "WASH"
    assert result["current_version"]["category_name"] == "Production"
    assert result["current_version"]["status"] == "DRAFT"
    assert result["current_version"]["inputs_count"] == 0


def test_update_basics_routes_to_current_draft_version(organization):
    category = _category(organization, "Production")
    quality = _category(organization, "Quality")
    definition = ProcessDefinition.objects.create(
        name="Washing", code="WASH", organization=organization
    )
    ProcessDefinitionVersion.objects.create(
        process_definition=definition,
        version_number=1,
        category=category,
        organization=organization,
    )
    client = _client_as("Manager/Admin", "mgr1")

    response = client.patch(
        f"/api/v1/process-definitions/{definition.id}/",
        {"category": quality.id, "description": "Rinses leaf."},
        format="json",
    )

    assert response.status_code == 200
    version = definition.current_version()
    version.refresh_from_db()
    assert version.category_id == quality.id
    assert version.description == "Rinses leaf."


def test_update_rejects_edit_when_current_version_not_draft(organization):
    category = _category(organization)
    definition = ProcessDefinition.objects.create(
        name="Washing", code="WASH", organization=organization
    )
    ProcessDefinitionVersion.objects.create(
        process_definition=definition,
        version_number=1,
        status=ProcessDefinitionVersion.Status.ACTIVE,
        category=category,
        organization=organization,
    )
    client = _client_as("Manager/Admin", "mgr2")

    response = client.patch(
        f"/api/v1/process-definitions/{definition.id}/", {"description": "Edited"}, format="json"
    )

    assert response.status_code == 400


def test_filter_by_category(organization):
    production = _category(organization, "Production")
    quality = _category(organization, "Quality")
    washing = ProcessDefinition.objects.create(
        name="Washing", code="WASH", organization=organization
    )
    ProcessDefinitionVersion.objects.create(
        process_definition=washing, version_number=1, category=production, organization=organization
    )
    sorting = ProcessDefinition.objects.create(
        name="Sorting", code="SORT", organization=organization
    )
    ProcessDefinitionVersion.objects.create(
        process_definition=sorting, version_number=1, category=quality, organization=organization
    )
    client = _client_as("Export Coordinator", "coord5")

    response = client.get(f"/api/v1/process-definitions/?category={quality.id}")

    names = [d["name"] for d in response.json()["results"]]
    assert names == ["Sorting"]


def test_search_by_name(organization):
    category = _category(organization)
    for name, code in [("Washing", "WASH"), ("Sorting", "SORT")]:
        d = ProcessDefinition.objects.create(name=name, code=code, organization=organization)
        ProcessDefinitionVersion.objects.create(
            process_definition=d, version_number=1, category=category, organization=organization
        )
    client = _client_as("Export Coordinator", "coord6")

    response = client.get("/api/v1/process-definitions/?search=Wash")

    names = [d["name"] for d in response.json()["results"]]
    assert names == ["Washing"]


def test_duplicate_clones_definition_version_and_inputs(organization):
    from apps.items.models import Item

    category = _category(organization)
    leaf = Item.objects.create(
        code="LEAF",
        name="Raw Leaf",
        item_class=Item.ItemClass.RAW_MATERIAL,
        organization=organization,
    )
    definition = ProcessDefinition.objects.create(
        name="Pressing", code="PRESS", organization=organization
    )
    version = ProcessDefinitionVersion.objects.create(
        process_definition=definition,
        version_number=1,
        category=category,
        description="Presses leaf.",
        organization=organization,
    )
    from apps.processes.models import ProcessInputDefinition

    ProcessInputDefinition.objects.create(
        process_version=version,
        sequence=1,
        input_type=ProcessInputDefinition.InputType.MATERIAL,
        item=leaf,
        uom="Kg",
        organization=organization,
    )
    client = _client_as("Export Coordinator", "coord7")

    response = client.post(f"/api/v1/process-definitions/{definition.id}/duplicate/")

    assert response.status_code == 201
    body = response.json()
    assert body["id"] != definition.id
    assert body["name"] == "Pressing (Copy)"
    assert body["code"] == "PRESS-COPY"
    copy = ProcessDefinition.objects.get(id=body["id"])
    copy_version = copy.current_version()
    assert copy_version.category_id == category.id
    assert copy_version.description == "Presses leaf."
    assert copy_version.inputs.count() == 1
    assert copy_version.inputs.first().item_id == leaf.id


def test_duplicate_clones_work_centre_fields(organization):
    category = _category(organization)
    definition = ProcessDefinition.objects.create(
        name="Pressing", code="PRESS", organization=organization
    )
    ProcessDefinitionVersion.objects.create(
        process_definition=definition,
        version_number=1,
        category=category,
        work_centre_requirement=ProcessDefinitionVersion.WorkCentreRequirement.MACHINE,
        operator_required=True,
        standard_rate_config_level=ProcessDefinitionVersion.StandardRateConfigLevel.WORK_CENTRE,
        organization=organization,
    )
    client = _client_as("Export Coordinator", "coord9")

    response = client.post(f"/api/v1/process-definitions/{definition.id}/duplicate/")

    assert response.status_code == 201
    copy = ProcessDefinition.objects.get(id=response.json()["id"])
    copy_version = copy.current_version()
    assert copy_version.work_centre_requirement == "MACHINE"
    assert copy_version.operator_required is True
    assert copy_version.standard_rate_config_level == "WORK_CENTRE"


def test_duplicate_clones_output_capture_fields(organization):
    category = _category(organization)
    definition = ProcessDefinition.objects.create(
        name="Pressing", code="PRESS", organization=organization
    )
    ProcessDefinitionVersion.objects.create(
        process_definition=definition,
        version_number=1,
        category=category,
        capture_mode=ProcessDefinitionVersion.CaptureMode.POSITION_LEVEL,
        position_label="Mould Position",
        default_position_count=6,
        allow_work_centre_override=True,
        allow_different_sku_per_position=True,
        organization=organization,
    )
    client = _client_as("Export Coordinator", "coord10")

    response = client.post(f"/api/v1/process-definitions/{definition.id}/duplicate/")

    assert response.status_code == 201
    copy = ProcessDefinition.objects.get(id=response.json()["id"])
    copy_version = copy.current_version()
    assert copy_version.capture_mode == "POSITION_LEVEL"
    assert copy_version.position_label == "Mould Position"
    assert copy_version.default_position_count == 6
    assert copy_version.allow_work_centre_override is True
    assert copy_version.allow_different_sku_per_position is True


def test_duplicate_clones_rules_fields(organization):
    category = _category(organization)
    definition = ProcessDefinition.objects.create(
        name="Pressing", code="PRESS", organization=organization
    )
    ProcessDefinitionVersion.objects.create(
        process_definition=definition,
        version_number=1,
        category=category,
        transaction_frequency=ProcessDefinitionVersion.TransactionFrequency.SHIFT,
        batch_lot_mode=ProcessDefinitionVersion.BatchLotMode.REQUIRED,
        partial_output_forward=False,
        allow_over_production=True,
        over_production_tolerance_percent=5,
        input_consumption_mode=ProcessDefinitionVersion.InputConsumptionMode.FORMULA,
        completion_mode=ProcessDefinitionVersion.CompletionMode.TARGET_REACHED,
        qc_requirement=ProcessDefinitionVersion.QcRequirement.REQUIRED,
        allow_correction_with_audit_trail=False,
        allow_destructive_delete=True,
        permit_machine_generated_source=False,
        organization=organization,
    )
    client = _client_as("Export Coordinator", "coord11")

    response = client.post(f"/api/v1/process-definitions/{definition.id}/duplicate/")

    assert response.status_code == 201
    copy = ProcessDefinition.objects.get(id=response.json()["id"])
    copy_version = copy.current_version()
    assert copy_version.transaction_frequency == "SHIFT"
    assert copy_version.batch_lot_mode == "REQUIRED"
    assert copy_version.partial_output_forward is False
    assert copy_version.allow_over_production is True
    assert copy_version.over_production_tolerance_percent == 5
    assert copy_version.input_consumption_mode == "FORMULA"
    assert copy_version.completion_mode == "TARGET_REACHED"
    assert copy_version.qc_requirement == "REQUIRED"
    assert copy_version.allow_correction_with_audit_trail is False
    assert copy_version.allow_destructive_delete is True
    assert copy_version.permit_machine_generated_source is False


def test_duplicate_twice_gets_distinct_codes(organization):
    category = _category(organization)
    definition = ProcessDefinition.objects.create(
        name="Pressing", code="PRESS", organization=organization
    )
    ProcessDefinitionVersion.objects.create(
        process_definition=definition,
        version_number=1,
        category=category,
        organization=organization,
    )
    client = _client_as("Export Coordinator", "coord8")

    first = client.post(f"/api/v1/process-definitions/{definition.id}/duplicate/")
    second = client.post(f"/api/v1/process-definitions/{definition.id}/duplicate/")

    assert first.json()["code"] == "PRESS-COPY"
    assert second.json()["code"] == "PRESS-COPY-2"


def test_delete_unused_process_succeeds(organization):
    category = _category(organization)
    definition = ProcessDefinition.objects.create(
        name="Pressing", code="PRESS", organization=organization
    )
    ProcessDefinitionVersion.objects.create(
        process_definition=definition,
        version_number=1,
        category=category,
        organization=organization,
    )
    client = _client_as("Manager/Admin", "mgr-del1")

    response = client.delete(f"/api/v1/process-definitions/{definition.id}/")

    assert response.status_code == 204
    assert not ProcessDefinition.objects.filter(id=definition.id).exists()


def test_delete_process_used_in_route_is_blocked_with_route_name(organization):
    from apps.items.models import Item
    from apps.product_routes.models import ProcessRoute, ProcessRouteVersion

    category = _category(organization)
    definition = ProcessDefinition.objects.create(
        name="Pressing", code="PRESS", organization=organization
    )
    ProcessDefinitionVersion.objects.create(
        process_definition=definition,
        version_number=1,
        category=category,
        organization=organization,
    )
    product = Item.objects.create(
        code="SQ10",
        name="10 Square Plate",
        item_class=Item.ItemClass.FINISHED_GOOD,
        organization=organization,
    )
    route = ProcessRoute.objects.create(
        name="Areca Plate — Standard Production", item=product, organization=organization
    )
    version = ProcessRouteVersion.objects.create(
        process_route=route, version_number=1, organization=organization
    )
    client = _client_as("Manager/Admin", "mgr-del2")
    client.patch(
        f"/api/v1/product-route-versions/{version.id}/nodes/",
        {"nodes": [{"process_definition": definition.id}]},
        format="json",
    )

    response = client.delete(f"/api/v1/process-definitions/{definition.id}/")

    assert response.status_code == 400
    assert "Areca Plate — Standard Production" in response.json()["detail"]
    assert ProcessDefinition.objects.filter(id=definition.id).exists()
