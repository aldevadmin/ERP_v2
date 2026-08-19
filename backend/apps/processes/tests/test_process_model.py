import pytest

from apps.materials.models import Material
from apps.processes.models import Process, ProcessCategory

pytestmark = pytest.mark.django_db


def test_str_is_name(organization):
    category = ProcessCategory.objects.create(name="Production", organization=organization)
    process = Process.objects.create(
        name="Washing",
        category=category,
        resource_type=Process.ResourceType.STATION,
        organization=organization,
    )

    assert str(process) == "Washing"


def test_inputs_and_outputs_are_independent_material_lists(organization):
    category = ProcessCategory.objects.create(name="Production", organization=organization)
    leaf = Material.objects.create(
        code="LEAF", name="Raw Leaf", unit="Kg", organization=organization
    )
    plate = Material.objects.create(
        code="PLATE", name="Pressed Plate", unit="Piece", organization=organization
    )
    process = Process.objects.create(
        name="Pressing",
        category=category,
        resource_type=Process.ResourceType.MACHINE,
        organization=organization,
    )

    process.inputs.set([leaf])
    process.outputs.set([plate])

    assert list(process.inputs.all()) == [leaf]
    assert list(process.outputs.all()) == [plate]
