import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.utils import timezone
from rest_framework.test import APIClient

from apps.items.models import Item
from apps.tooling.models import (
    Tooling,
    ToolingAssignment,
    ToolingCompatibility,
    ToolingType,
    WorkCentrePosition,
)
from apps.work_centres.models import WorkCentre, WorkCentreType

pytestmark = pytest.mark.django_db

User = get_user_model()


def _client_as(role_name: str, username: str) -> APIClient:
    client = APIClient()
    user = User.objects.create_user(username=username, password="x")
    user.groups.add(Group.objects.get(name=role_name))
    client.force_authenticate(user=user)
    return client


def _work_centre(organization, code: str = "WC-1") -> WorkCentre:
    work_centre_type, _ = WorkCentreType.objects.get_or_create(
        name="Machine", defaults={"organization": organization}
    )
    return WorkCentre.objects.create(
        code=code, name="Press Machine 01", type=work_centre_type, organization=organization
    )


def _tooling(organization, code: str = "MLD-101") -> Tooling:
    tooling_type, _ = ToolingType.objects.get_or_create(
        name="Mould", defaults={"organization": organization}
    )
    return Tooling.objects.create(
        code=code, name="Mould", tooling_type=tooling_type, organization=organization
    )


def _product(organization, sku_code: str = "PLATE-10") -> Item:
    return Item.objects.create(
        code=sku_code,
        name="10 Inch Plate",
        item_class=Item.ItemClass.FINISHED_GOOD,
        organization=organization,
    )


def _position(organization, work_centre: WorkCentre, index: int = 1) -> WorkCentrePosition:
    return WorkCentrePosition.objects.create(
        work_centre=work_centre, position_index=index, organization=organization
    )


def test_set_positions_whole_list_replace(organization):
    work_centre = _work_centre(organization)
    client = _client_as("Manager/Admin", "mgr1")

    response = client.put(
        f"/api/v1/work-centres/{work_centre.id}/positions/",
        {
            "positions": [
                {"display_label": "Mould Position 1"},
                {"display_label": "Mould Position 2"},
            ]
        },
        format="json",
    )

    assert response.status_code == 200
    body = response.json()
    assert body["positions_count"] == 2
    assert [p["position_index"] for p in body["positions"]] == [1, 2]


def test_positions_response_reflects_new_row(organization):
    # Regression test — same stale-prefetch-cache class of bug fixed in
    # apps.processes and apps.tooling's compatibilities action.
    work_centre = _work_centre(organization)
    client = _client_as("Manager/Admin", "mgr2")

    response = client.put(
        f"/api/v1/work-centres/{work_centre.id}/positions/",
        {"positions": [{"display_label": "Position 1"}]},
        format="json",
    )

    assert response.status_code == 200
    assert len(response.json()["positions"]) == 1


def test_reordering_positions_does_not_collide(organization):
    work_centre = _work_centre(organization)
    client = _client_as("Manager/Admin", "mgr3")
    create_response = client.put(
        f"/api/v1/work-centres/{work_centre.id}/positions/",
        {"positions": [{"display_label": "A"}, {"display_label": "B"}]},
        format="json",
    )
    positions = create_response.json()["positions"]

    response = client.put(
        f"/api/v1/work-centres/{work_centre.id}/positions/",
        {
            "positions": [
                {"id": positions[1]["id"], "display_label": "B"},
                {"id": positions[0]["id"], "display_label": "A"},
            ]
        },
        format="json",
    )

    assert response.status_code == 200
    reordered = response.json()["positions"]
    assert [p["display_label"] for p in reordered] == ["B", "A"]


def test_create_assignment_installs_tooling(organization):
    work_centre = _work_centre(organization)
    position = _position(organization, work_centre)
    tooling = _tooling(organization)
    client = _client_as("Manager/Admin", "mgr4")

    response = client.post(
        f"/api/v1/work-centre-positions/{position.id}/assignments/",
        {"tooling": tooling.id, "effective_from": timezone.now().isoformat()},
        format="json",
    )

    assert response.status_code == 201
    assert response.json()["tooling"] == tooling.id
    position_response = client.get(f"/api/v1/work-centres/{work_centre.id}/")
    installed = position_response.json()["positions"][0]["installed_tooling_code"]
    assert installed == tooling.code


def test_changeover_closes_previous_assignment(organization):
    work_centre = _work_centre(organization)
    position = _position(organization, work_centre)
    old_tooling = _tooling(organization, "MLD-205")
    new_tooling = _tooling(organization, "MLD-310")
    client = _client_as("Manager/Admin", "mgr5")
    start = timezone.now()
    old = ToolingAssignment.objects.create(
        tooling=old_tooling,
        work_centre_position=position,
        effective_from=start,
        organization=organization,
    )
    changeover_time = start + timezone.timedelta(hours=1)

    response = client.post(
        f"/api/v1/work-centre-positions/{position.id}/assignments/",
        {"tooling": new_tooling.id, "effective_from": changeover_time.isoformat()},
        format="json",
    )

    assert response.status_code == 201
    old.refresh_from_db()
    assert old.effective_to == changeover_time
    history = client.get(f"/api/v1/work-centre-positions/{position.id}/assignments/")
    assert len(history.json()) == 2


def test_incompatible_item_is_rejected(organization):
    work_centre = _work_centre(organization)
    position = _position(organization, work_centre)
    tooling = _tooling(organization)
    incompatible_product = _product(organization, "OTHER-SKU")
    client = _client_as("Manager/Admin", "mgr6")

    response = client.post(
        f"/api/v1/work-centre-positions/{position.id}/assignments/",
        {
            "tooling": tooling.id,
            "default_item": incompatible_product.id,
            "effective_from": timezone.now().isoformat(),
        },
        format="json",
    )

    assert response.status_code == 400


def test_compatible_item_is_accepted(organization):
    work_centre = _work_centre(organization)
    position = _position(organization, work_centre)
    tooling = _tooling(organization)
    product = _product(organization)
    ToolingCompatibility.objects.create(tooling=tooling, item=product, organization=organization)
    client = _client_as("Manager/Admin", "mgr7")

    response = client.post(
        f"/api/v1/work-centre-positions/{position.id}/assignments/",
        {
            "tooling": tooling.id,
            "default_item": product.id,
            "effective_from": timezone.now().isoformat(),
        },
        format="json",
    )

    assert response.status_code == 201


def test_tooling_already_active_elsewhere_is_rejected(organization):
    work_centre = _work_centre(organization)
    position_a = _position(organization, work_centre, index=1)
    position_b = _position(organization, work_centre, index=2)
    tooling = _tooling(organization)
    ToolingAssignment.objects.create(
        tooling=tooling,
        work_centre_position=position_a,
        effective_from=timezone.now(),
        organization=organization,
    )
    client = _client_as("Manager/Admin", "mgr8")

    response = client.post(
        f"/api/v1/work-centre-positions/{position_b.id}/assignments/",
        {"tooling": tooling.id, "effective_from": timezone.now().isoformat()},
        format="json",
    )

    assert response.status_code == 400


def test_end_assignment_without_replacement(organization):
    work_centre = _work_centre(organization)
    position = _position(organization, work_centre)
    tooling = _tooling(organization)
    assignment = ToolingAssignment.objects.create(
        tooling=tooling,
        work_centre_position=position,
        effective_from=timezone.now(),
        organization=organization,
    )
    client = _client_as("Manager/Admin", "mgr9")

    response = client.post(f"/api/v1/tooling-assignments/{assignment.id}/end/")

    assert response.status_code == 200
    assignment.refresh_from_db()
    assert assignment.effective_to is not None


def test_ending_already_closed_assignment_is_rejected(organization):
    work_centre = _work_centre(organization)
    position = _position(organization, work_centre)
    tooling = _tooling(organization)
    start = timezone.now()
    assignment = ToolingAssignment.objects.create(
        tooling=tooling,
        work_centre_position=position,
        effective_from=start,
        effective_to=start + timezone.timedelta(hours=1),
        organization=organization,
    )
    client = _client_as("Manager/Admin", "mgr10")

    response = client.post(f"/api/v1/tooling-assignments/{assignment.id}/end/")

    assert response.status_code == 400


def test_assignment_history_is_readable_by_internal_staff(organization):
    work_centre = _work_centre(organization)
    position = _position(organization, work_centre)
    client = _client_as("Packing Coordinator", "pack1")

    response = client.get(f"/api/v1/work-centre-positions/{position.id}/assignments/")

    assert response.status_code == 200


def test_six_positions_with_distinct_tooling_and_skus_resolve_independently(organization):
    # Regression scenario from the Batch 3 plan: a machine with six positions,
    # each carrying a different mould assigned to a different SKU, must
    # resolve independently — no cross-talk between positions or tools.
    work_centre = _work_centre(organization)
    client = _client_as("Manager/Admin", "mgr-six")

    positions_response = client.put(
        f"/api/v1/work-centres/{work_centre.id}/positions/",
        {"positions": [{"display_label": f"Position {i}"} for i in range(1, 7)]},
        format="json",
    )
    position_ids = [p["id"] for p in positions_response.json()["positions"]]

    for i, position_id in enumerate(position_ids, start=1):
        tooling = _tooling(organization, code=f"MLD-{100 + i}")
        product = _product(organization, sku_code=f"SKU-{i}")
        ToolingCompatibility.objects.create(
            tooling=tooling, item=product, organization=organization
        )
        response = client.post(
            f"/api/v1/work-centre-positions/{position_id}/assignments/",
            {
                "tooling": tooling.id,
                "default_item": product.id,
                "standard_rate_override": 10 * i,
                "effective_from": timezone.now().isoformat(),
            },
            format="json",
        )
        assert response.status_code == 201

    final = client.get(f"/api/v1/work-centres/{work_centre.id}/")
    positions = final.json()["positions"]
    assert len(positions) == 6
    for i, position in enumerate(sorted(positions, key=lambda p: p["position_index"]), start=1):
        assert position["installed_tooling_code"] == f"MLD-{100 + i}"
        assert position["default_sku"] == f"10 Inch Plate (SKU-{i})"
        assert position["standard_rate"] == f"{10 * i}.00"
