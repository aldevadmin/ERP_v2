"""The proof that this whole redesign actually works: model a real
multi-stage chain (mirroring the user's own Chopping -> Washing -> Pressing
-> Trimming -> Grading example, Grading branching into Good/Standard/
Reject), configure item mappings for TWO different concrete SKU sizes
against the exact same route/node structure, and confirm `resolve_item()`
returns the correct, different concrete item at every slot per size —
including every branch of the Grading node.
"""

import pytest

from apps.items.models import Item, ItemGroup
from apps.processes.models import OutputClassification, ProcessCategory
from apps.processes_v1.models import (
    ProcessDefinitionV1,
    ProcessDefinitionVersionV1,
    ProcessInputDefinitionV1,
    ProcessOutputDefinitionV1,
)
from apps.product_routes_v1.models import (
    ProcessRouteItemMappingV1,
    ProcessRouteNodeV1,
    ProcessRouteV1,
    ProcessRouteVersionV1,
)
from apps.product_routes_v1.services import resolve_item

pytestmark = pytest.mark.django_db


@pytest.fixture
def groups(organization) -> dict[str, ItemGroup]:
    names = [
        "Raw Leaf Sheath",
        "Template",
        "Washed Template",
        "Untrimmed Plate",
        "Trimmed Plate",
        "Good Plate",
        "Standard Plate",
        "Reject Plate",
    ]
    return {name: ItemGroup.objects.create(name=name, organization=organization) for name in names}


def _single_io_process(organization, category, code, *, input_group, output_group):
    definition = ProcessDefinitionV1.objects.create(name=code, code=code, organization=organization)
    version = ProcessDefinitionVersionV1.objects.create(
        process_definition=definition, version_number=1, category=category, organization=organization
    )
    ProcessInputDefinitionV1.objects.create(
        process_version=version, sequence=1, item_group=input_group, uom="PC", organization=organization
    )
    ProcessOutputDefinitionV1.objects.create(
        process_version=version, sequence=1, item_group=output_group, uom="PC", organization=organization
    )
    return version


@pytest.fixture
def chain(organization, groups):
    """Chopping -> Washing -> Pressing -> Trimming -> Grading (branching
    Good/Standard/Reject), as a single Route in the "Good Plate" item
    group — mirrors the user's own reference chain.
    """
    category = ProcessCategory.objects.create(name="Production", organization=organization)

    chopping = _single_io_process(
        organization, category, "CHOP",
        input_group=groups["Raw Leaf Sheath"], output_group=groups["Template"],
    )
    washing = _single_io_process(
        organization, category, "WASH",
        input_group=groups["Template"], output_group=groups["Washed Template"],
    )
    pressing = _single_io_process(
        organization, category, "PRESS",
        input_group=groups["Washed Template"], output_group=groups["Untrimmed Plate"],
    )
    trimming = _single_io_process(
        organization, category, "TRIM",
        input_group=groups["Untrimmed Plate"], output_group=groups["Trimmed Plate"],
    )

    grading_def = ProcessDefinitionV1.objects.create(name="Grading", code="GRADE", organization=organization)
    grading = ProcessDefinitionVersionV1.objects.create(
        process_definition=grading_def, version_number=1, category=category, organization=organization
    )
    ProcessInputDefinitionV1.objects.create(
        process_version=grading, sequence=1, item_group=groups["Trimmed Plate"], uom="PC", organization=organization
    )
    good_output = ProcessOutputDefinitionV1.objects.create(
        process_version=grading, sequence=1, item_group=groups["Good Plate"],
        classification=OutputClassification.objects.get(name="Good"), uom="PC", organization=organization,
    )
    standard_output = ProcessOutputDefinitionV1.objects.create(
        process_version=grading, sequence=2, item_group=groups["Standard Plate"],
        classification=OutputClassification.objects.get(name="Standard"), uom="PC", organization=organization,
    )
    reject_output = ProcessOutputDefinitionV1.objects.create(
        process_version=grading, sequence=3, item_group=groups["Reject Plate"],
        classification=OutputClassification.objects.get(name="Reject"), uom="PC", organization=organization,
    )

    route = ProcessRouteV1.objects.create(
        name="Standard Palm Plate Route", item_group=groups["Good Plate"], organization=organization
    )
    route_version = ProcessRouteVersionV1.objects.create(
        process_route=route, version_number=1, organization=organization
    )

    def _node(key, definition, sequence):
        return ProcessRouteNodeV1.objects.create(
            route_version=route_version, node_key=key, process_definition=definition,
            sequence_hint=sequence, organization=organization,
        )

    nodes = {
        "chopping": _node("chopping", chopping.process_definition, 1),
        "washing": _node("washing", washing.process_definition, 2),
        "pressing": _node("pressing", pressing.process_definition, 3),
        "trimming": _node("trimming", trimming.process_definition, 4),
        "grading": _node("grading", grading_def, 5),
    }

    return {
        "organization": organization,
        "route_version": route_version,
        "nodes": nodes,
        "outputs": {"good": good_output, "standard": standard_output, "reject": reject_output},
        "groups": groups,
    }


def _item(organization, code, name, item_class, item_group, classification_name=None):
    classification = (
        OutputClassification.objects.get(name=classification_name) if classification_name else None
    )
    return Item.objects.create(
        code=code, name=name, item_class=item_class, item_group=item_group,
        classification=classification, organization=organization,
    )


@pytest.fixture
def two_sizes(chain):
    """Two complete sets of concrete items for the chain above — a 10x10
    and a 9x9 plate — each fully mapped through every node.
    """
    organization = chain["organization"]
    groups = chain["groups"]
    route_version = chain["route_version"]
    nodes = chain["nodes"]
    outputs = chain["outputs"]

    sizes = {}
    for size in ("10x10", "9x9"):
        target = _item(
            organization, f"FG-{size}", f"{size} Palm Plate", Item.ItemClass.FINISHED_GOOD,
            groups["Good Plate"],
        )
        concrete = {
            "template": _item(organization, f"TPL-{size}", f"Template {size}", Item.ItemClass.WIP, groups["Template"]),
            "washed": _item(organization, f"WASH-{size}", f"Washed Template {size}", Item.ItemClass.WIP, groups["Washed Template"]),
            "untrimmed": _item(organization, f"UNTRIM-{size}", f"Untrimmed {size}", Item.ItemClass.WIP, groups["Untrimmed Plate"]),
            "trimmed": _item(organization, f"TRIM-{size}", f"Trimmed {size}", Item.ItemClass.WIP, groups["Trimmed Plate"]),
            "good": target,
            "standard": _item(organization, f"STD-{size}", f"Standard {size}", Item.ItemClass.WIP, groups["Standard Plate"], "Standard"),
            "reject": _item(organization, f"REJ-{size}", f"Reject {size}", Item.ItemClass.WIP, groups["Reject Plate"], "Reject"),
        }

        def _map(node_key, *, output=None, input_def=None, resolved):
            ProcessRouteItemMappingV1.objects.create(
                route_version=route_version, node=nodes[node_key],
                output_definition=output, input_definition=input_def,
                target_item=target, resolved_item=resolved, organization=organization,
            )

        chopping_output = nodes["chopping"].process_definition.current_version().outputs.first()
        _map("chopping", output=chopping_output, resolved=concrete["template"])
        washing_output = nodes["washing"].process_definition.current_version().outputs.first()
        _map("washing", output=washing_output, resolved=concrete["washed"])
        pressing_output = nodes["pressing"].process_definition.current_version().outputs.first()
        _map("pressing", output=pressing_output, resolved=concrete["untrimmed"])
        trimming_output = nodes["trimming"].process_definition.current_version().outputs.first()
        _map("trimming", output=trimming_output, resolved=concrete["trimmed"])
        _map("grading", output=outputs["good"], resolved=concrete["good"])
        _map("grading", output=outputs["standard"], resolved=concrete["standard"])
        _map("grading", output=outputs["reject"], resolved=concrete["reject"])

        sizes[size] = {"target": target, "concrete": concrete}

    return sizes


def test_resolves_the_correct_concrete_item_per_slot_per_size(chain, two_sizes):
    route_version = chain["route_version"]
    nodes = chain["nodes"]
    outputs = chain["outputs"]

    for size, data in two_sizes.items():
        target = data["target"]
        concrete = data["concrete"]

        chopping_output = nodes["chopping"].process_definition.current_version().outputs.first()
        assert resolve_item(route_version, nodes["chopping"], target, output_definition=chopping_output) == concrete["template"]

        washing_output = nodes["washing"].process_definition.current_version().outputs.first()
        assert resolve_item(route_version, nodes["washing"], target, output_definition=washing_output) == concrete["washed"]

        pressing_output = nodes["pressing"].process_definition.current_version().outputs.first()
        assert resolve_item(route_version, nodes["pressing"], target, output_definition=pressing_output) == concrete["untrimmed"]

        trimming_output = nodes["trimming"].process_definition.current_version().outputs.first()
        assert resolve_item(route_version, nodes["trimming"], target, output_definition=trimming_output) == concrete["trimmed"]

        assert resolve_item(route_version, nodes["grading"], target, output_definition=outputs["good"]) == concrete["good"]
        assert resolve_item(route_version, nodes["grading"], target, output_definition=outputs["standard"]) == concrete["standard"]
        assert resolve_item(route_version, nodes["grading"], target, output_definition=outputs["reject"]) == concrete["reject"]


def test_the_two_sizes_resolve_to_genuinely_different_items(two_sizes):
    ten = two_sizes["10x10"]["concrete"]
    nine = two_sizes["9x9"]["concrete"]

    for stage in ("template", "washed", "untrimmed", "trimmed", "good", "standard", "reject"):
        assert ten[stage].id != nine[stage].id


def test_raises_clear_error_for_unmapped_combination(chain):
    route_version = chain["route_version"]
    nodes = chain["nodes"]
    outputs = chain["outputs"]
    unmapped_target = Item.objects.create(
        code="FG-UNMAPPED", name="Unmapped size", item_class=Item.ItemClass.FINISHED_GOOD,
        item_group=chain["groups"]["Good Plate"], organization=chain["organization"],
    )

    with pytest.raises(ValueError, match="No item mapping configured"):
        resolve_item(route_version, nodes["grading"], unmapped_target, output_definition=outputs["good"])


def test_requires_exactly_one_of_output_or_input_definition(chain, two_sizes):
    route_version = chain["route_version"]
    nodes = chain["nodes"]
    target = two_sizes["10x10"]["target"]

    with pytest.raises(ValueError, match="Exactly one"):
        resolve_item(route_version, nodes["grading"], target)
