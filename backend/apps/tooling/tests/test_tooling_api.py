import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework.test import APIClient

from apps.processes.models import ProcessCategory, ProcessDefinition, ProcessDefinitionVersion
from apps.products.models import Product
from apps.tooling.models import Tooling, ToolingCompatibility, ToolingType

pytestmark = pytest.mark.django_db

User = get_user_model()


def _client_as(role_name: str, username: str) -> APIClient:
    client = APIClient()
    user = User.objects.create_user(username=username, password="x")
    user.groups.add(Group.objects.get(name=role_name))
    client.force_authenticate(user=user)
    return client


def _tooling_type(organization, name: str = "Mould") -> ToolingType:
    tooling_type, _ = ToolingType.objects.get_or_create(
        name=name, defaults={"organization": organization}
    )
    return tooling_type


def _tooling(
    organization, code: str = "MLD-101", tooling_type: ToolingType | None = None
) -> Tooling:
    return Tooling.objects.create(
        code=code,
        name="10 Inch Round Mould",
        tooling_type=tooling_type or _tooling_type(organization),
        default_standard_rate=60,
        organization=organization,
    )


def _product(organization, sku_code: str = "PLATE-10") -> Product:
    return Product.objects.create(
        sku_code=sku_code,
        name="10 Inch Round Plate",
        base_unit="Piece",
        stage=Product.Stage.FINISHED_GOOD,
        organization=organization,
    )


def _process(organization, code: str = "PRESS") -> ProcessDefinition:
    category, _ = ProcessCategory.objects.get_or_create(
        name="Production", defaults={"organization": organization}
    )
    definition = ProcessDefinition.objects.create(
        name="Pressing", code=code, organization=organization
    )
    ProcessDefinitionVersion.objects.create(
        process_definition=definition,
        version_number=1,
        status=ProcessDefinitionVersion.Status.ACTIVE,
        category=category,
        organization=organization,
    )
    return definition


def test_create_tooling(organization):
    tooling_type = _tooling_type(organization)
    client = _client_as("Manager/Admin", "mgr1")

    response = client.post(
        "/api/v1/tooling/",
        {
            "code": "MLD-101",
            "name": "10 Inch Round Mould",
            "tooling_type": tooling_type.id,
            "cavity_count": 1,
            "default_standard_rate": "60.00",
        },
        format="json",
    )

    assert response.status_code == 201
    assert Tooling.objects.filter(code="MLD-101").exists()


def test_list_tooling_filters_by_type(organization):
    die_type = _tooling_type(organization, name="Die")
    _tooling(organization, code="MLD-101", tooling_type=_tooling_type(organization))
    _tooling(organization, code="DIE-010", tooling_type=die_type)
    client = _client_as("Export Coordinator", "coord1")

    response = client.get(f"/api/v1/tooling/?type={die_type.id}")

    assert response.status_code == 200
    codes = [row["code"] for row in response.json()["results"]]
    assert codes == ["DIE-010"]


def test_list_tooling_filters_by_item_id(organization):
    tooling = _tooling(organization)
    other = _tooling(organization, code="MLD-205")
    product = _product(organization)
    ToolingCompatibility.objects.create(tooling=tooling, product=product, organization=organization)
    client = _client_as("Export Coordinator", "coord2")

    response = client.get(f"/api/v1/tooling/?item_id={product.id}")

    codes = [row["code"] for row in response.json()["results"]]
    assert codes == [tooling.code]
    assert other.code not in codes


def test_set_compatibilities_whole_list_replace(organization):
    tooling = _tooling(organization)
    plate = _product(organization, "PLATE-10")
    veneer = _product(organization, "PLATE-VEN")
    process = _process(organization)
    client = _client_as("Manager/Admin", "mgr2")

    response = client.put(
        f"/api/v1/tooling/{tooling.id}/compatibilities/",
        {
            "compatibilities": [
                {"product": plate.id},
                {"product": veneer.id, "process_definition": process.id},
            ]
        },
        format="json",
    )

    assert response.status_code == 200
    body = response.json()
    assert body["compatibilities_count"] == 2
    assert len(body["compatibilities"]) == 2


def test_compatibilities_response_reflects_new_row(organization):
    # Regression test for the same stale-prefetch-cache class of bug fixed
    # in apps.processes: the response must reflect the write that was just
    # made, not a cache taken before it.
    tooling = _tooling(organization)
    plate = _product(organization)
    client = _client_as("Manager/Admin", "mgr3")

    response = client.put(
        f"/api/v1/tooling/{tooling.id}/compatibilities/",
        {"compatibilities": [{"product": plate.id}]},
        format="json",
    )

    assert response.status_code == 200
    assert len(response.json()["compatibilities"]) == 1


def test_delete_unused_tooling_succeeds(organization):
    tooling = _tooling(organization)
    client = _client_as("Manager/Admin", "mgr4")

    response = client.delete(f"/api/v1/tooling/{tooling.id}/")

    assert response.status_code == 204
    assert not Tooling.objects.filter(id=tooling.id).exists()


def test_delete_tooling_with_assignment_history_is_blocked(organization):
    from django.utils import timezone

    from apps.tooling.models import ToolingAssignment, WorkCentrePosition
    from apps.work_centres.models import WorkCentre, WorkCentreType

    tooling = _tooling(organization)
    work_centre_type, _ = WorkCentreType.objects.get_or_create(
        name="Machine", defaults={"organization": organization}
    )
    work_centre = WorkCentre.objects.create(
        code="WC-1", name="Press 01", type=work_centre_type, organization=organization
    )
    position = WorkCentrePosition.objects.create(
        work_centre=work_centre, position_index=1, organization=organization
    )
    ToolingAssignment.objects.create(
        tooling=tooling,
        work_centre_position=position,
        effective_from=timezone.now(),
        organization=organization,
    )
    client = _client_as("Manager/Admin", "mgr5")

    response = client.delete(f"/api/v1/tooling/{tooling.id}/")

    assert response.status_code == 400
    assert Tooling.objects.filter(id=tooling.id).exists()
