from django.db import models

from apps.core.models import BaseModel


class ProcessRouteV1(BaseModel):
    """A product family's stable logical route identity (e.g. "Standard
    Palm Plate Production") — name never changes across versions.
    Everything that's actually configured (steps, branching, item
    mappings) lives on `ProcessRouteVersionV1`, mirroring
    `apps.product_routes.ProcessRoute`/`ProcessRouteVersion` exactly.

    Unlike the original `ProcessRoute` (scoped to one single `items.Item`),
    this is scoped to a whole `items.ItemGroup` — the same route chain
    (Chopping -> Washing -> Pressing -> Trimming -> ...) can now serve many
    concrete finished SKUs, with the actual per-SKU item at each step
    resolved separately via `ProcessRouteItemMappingV1`.

    `item_group` here is deliberately just a broad, descriptive label for
    browsing/filtering routes ("this route is for the Plate family") — it
    is NOT used to gate which target items can be registered against the
    route (see `ProcessRouteVersionV1ViewSet.item_mappings`'s comment):
    a real finished item's own group is typically much narrower and
    size-specific ("FG Plate Areca Sq10x10"), so requiring it to equal the
    route's own (broader) group would make it impossible for one route to
    ever serve more than one size — defeating the whole point. No
    uniqueness constraint on `item_group` — multiple routes per group stay
    allowed (e.g. a "fast" vs "quality" route for the same family),
    matching the old model's behaviour.
    """

    name = models.CharField(max_length=255)
    item_group = models.ForeignKey(
        "items.ItemGroup", on_delete=models.PROTECT, related_name="routes_v1"
    )
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="process_routes_v1"
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return f"{self.name} ({self.item_group})"

    def current_version(self) -> "ProcessRouteVersionV1 | None":
        """The version the UI/API should read and write — the `ACTIVE` one
        if there is one, otherwise the latest `DRAFT`/`ARCHIVED` row.
        """
        return (
            self.versions.filter(status=ProcessRouteVersionV1.Status.ACTIVE).first()
            or self.versions.first()
        )


class ProcessRouteVersionV1(BaseModel):
    """One versioned configuration snapshot of a `ProcessRouteV1` — only a
    `DRAFT` version may be edited; once `ACTIVE` it's immutable (enforced
    in `views.py`).
    """

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        ACTIVE = "ACTIVE", "Active"
        ARCHIVED = "ARCHIVED", "Archived"

    process_route = models.ForeignKey(
        ProcessRouteV1, on_delete=models.CASCADE, related_name="versions"
    )
    version_number = models.PositiveIntegerField(editable=False)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    is_default = models.BooleanField(default=False)
    effective_from = models.DateField(null=True, blank=True)
    effective_to = models.DateField(null=True, blank=True)
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="process_route_versions_v1"
    )

    class Meta:
        ordering = ["-version_number"]
        constraints = [
            models.UniqueConstraint(
                fields=["process_route", "version_number"], name="unique_route_version_per_route_v1"
            )
        ]

    def __str__(self) -> str:
        return f"{self.process_route.name} v{self.version_number} ({self.status})"


class ProcessRouteNodeV1(BaseModel):
    """One step on a `ProcessRouteVersionV1` — references a
    `processes_v1.ProcessDefinitionV1` (stable identity), resolved
    dynamically to its current active version while the route version is
    `DRAFT`. `process_definition_version` is populated only at
    `activate()` time, pinning the exact version this route step used.
    `sequence_hint` drives display order only; `ProcessRouteEdgeV1` is the
    authoritative source of connectivity.
    """

    route_version = models.ForeignKey(
        ProcessRouteVersionV1, on_delete=models.CASCADE, related_name="nodes"
    )
    node_key = models.CharField(max_length=64)
    process_definition = models.ForeignKey(
        "processes_v1.ProcessDefinitionV1", on_delete=models.PROTECT, related_name="+"
    )
    process_definition_version = models.ForeignKey(
        "processes_v1.ProcessDefinitionVersionV1",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
    )
    display_label = models.CharField(max_length=255, blank=True)
    sequence_hint = models.PositiveIntegerField()
    is_optional = models.BooleanField(default=False)
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="process_route_nodes_v1"
    )

    class Meta:
        ordering = ["sequence_hint"]
        constraints = [
            models.UniqueConstraint(
                fields=["route_version", "node_key"], name="unique_node_key_per_version_v1"
            )
        ]

    def __str__(self) -> str:
        return self.display_label or str(self.process_definition)


class ProcessRouteEdgeV1(BaseModel):
    """One connection between route nodes — or a terminal disposition for a
    node's output. `source_output_definition` is null for a node's single
    default path forward; set to a specific
    `processes_v1.ProcessOutputDefinitionV1` row for branching nodes.
    `target_node` is set when `disposition_type` is `CONTINUE_TO_PROCESS`;
    `destination_location` is set when it's `MOVE_TO_STORAGE` — reuses the
    existing `product_routes.StorageLocation` lookup, not duplicated here.
    """

    class Disposition(models.TextChoices):
        CONTINUE_TO_PROCESS = "CONTINUE_TO_PROCESS", "Continue to Process"
        MOVE_TO_STORAGE = "MOVE_TO_STORAGE", "Move / Store"

    route_version = models.ForeignKey(
        ProcessRouteVersionV1, on_delete=models.CASCADE, related_name="edges"
    )
    source_node = models.ForeignKey(
        ProcessRouteNodeV1, on_delete=models.CASCADE, related_name="outgoing_edges"
    )
    source_output_definition = models.ForeignKey(
        "processes_v1.ProcessOutputDefinitionV1",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
    )
    target_node = models.ForeignKey(
        ProcessRouteNodeV1,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="incoming_edges",
    )
    disposition_type = models.CharField(max_length=20, choices=Disposition.choices)
    destination_location = models.ForeignKey(
        "product_routes.StorageLocation", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="process_route_edges_v1"
    )

    def __str__(self) -> str:
        return f"{self.source_node} -> {self.target_node or self.destination_location}"


class ProcessRouteItemMappingV1(BaseModel):
    """The actual resolver data — no old equivalent. A `ProcessRouteV1` and
    its nodes describe the *shape* of a chain generically, once per item
    family; this table says which *concrete* item plays each role, once
    per real finished SKU (`target_item`). The same route/node structure
    can carry many of these mapping sets, one per SKU size, without any
    duplication of the route itself.

    Keyed by the specific `input_definition`/`output_definition` (exactly
    one of the two), not just `node` — a branching node (e.g. Good/
    Standard/Reject, each its own `ProcessOutputDefinitionV1` row) needs a
    different `resolved_item` per output slot for the same node and same
    `target_item`. `node` is still kept on the row (not derivable purely
    from the definition) because the same Process/version could in
    principle appear at more than one node in a route — `node`
    disambiguates *which occurrence*, the same reason `ProcessRouteEdge`
    keeps `source_node` even though `source_output_definition` nearly
    pins it down.
    """

    route_version = models.ForeignKey(
        ProcessRouteVersionV1, on_delete=models.CASCADE, related_name="item_mappings"
    )
    node = models.ForeignKey(
        ProcessRouteNodeV1, on_delete=models.CASCADE, related_name="item_mappings"
    )
    input_definition = models.ForeignKey(
        "processes_v1.ProcessInputDefinitionV1",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
    )
    output_definition = models.ForeignKey(
        "processes_v1.ProcessOutputDefinitionV1",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
    )
    target_item = models.ForeignKey("items.Item", on_delete=models.PROTECT, related_name="+")
    resolved_item = models.ForeignKey("items.Item", on_delete=models.PROTECT, related_name="+")
    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.PROTECT,
        related_name="process_route_item_mappings_v1",
    )

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=(
                    models.Q(input_definition__isnull=False, output_definition__isnull=True)
                    | models.Q(input_definition__isnull=True, output_definition__isnull=False)
                ),
                name="exactly_one_definition_per_mapping",
            ),
            # Scoped by `node` (not just the definition) — `node` implies
            # one specific route_version, so two different routes (or two
            # versions of the same route) that happen to share the same
            # underlying process's output/input definition and the same
            # target_item are still independent mapping sets. Without
            # `node` here, duplicating a route (which reuses the original,
            # un-duplicated Process definitions) would collide with the
            # source route's own mappings for the same target_item.
            models.UniqueConstraint(
                fields=["node", "output_definition", "target_item"],
                condition=models.Q(output_definition__isnull=False),
                name="unique_output_mapping_per_target",
            ),
            models.UniqueConstraint(
                fields=["node", "input_definition", "target_item"],
                condition=models.Q(input_definition__isnull=False),
                name="unique_input_mapping_per_target",
            ),
        ]

    def __str__(self) -> str:
        role = self.input_definition or self.output_definition
        return f"{self.node} [{role}] {self.target_item} -> {self.resolved_item}"
