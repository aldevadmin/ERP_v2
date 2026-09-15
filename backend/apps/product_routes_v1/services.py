from typing import Any

from apps.items.models import Item
from apps.processes_v1.models import ProcessInputDefinitionV1, ProcessOutputDefinitionV1

from .models import ProcessRouteItemMappingV1, ProcessRouteNodeV1, ProcessRouteVersionV1


def resolve_item(
    route_version: ProcessRouteVersionV1,
    node: ProcessRouteNodeV1,
    target_item: Item,
    *,
    output_definition: ProcessOutputDefinitionV1 | None = None,
    input_definition: ProcessInputDefinitionV1 | None = None,
) -> Item:
    """The actual generalization mechanism: given a generic-typed slot
    (one of a node's Input/Output definitions) and the real finished item
    a Job is running against, return the concrete `Item` that plays that
    role for this specific SKU — read from whatever was configured once,
    per size, in `ProcessRouteItemMappingV1`.

    Exactly one of `output_definition`/`input_definition` must be given —
    mirrors the exclusivity already enforced on the mapping row itself.
    Raises `ValueError` with a clear message if no mapping exists for this
    exact (route_version, node, definition, target_item) combination —
    callers should treat that as "this SKU hasn't been configured for this
    route yet," not a bug.
    """
    if bool(output_definition) == bool(input_definition):
        raise ValueError("Exactly one of output_definition/input_definition is required.")

    lookup: dict[str, Any] = {
        "route_version": route_version,
        "node": node,
        "target_item": target_item,
    }
    if output_definition is not None:
        lookup["output_definition"] = output_definition
    else:
        lookup["input_definition"] = input_definition

    mapping = ProcessRouteItemMappingV1.objects.filter(**lookup).first()
    if mapping is None:
        role = output_definition or input_definition
        raise ValueError(
            f"No item mapping configured for {node} [{role}] against {target_item} — "
            "configure it in the route's Item Mappings before recording against this SKU."
        )
    return mapping.resolved_item
