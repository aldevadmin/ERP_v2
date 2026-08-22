from django.db import models

from apps.core.models import BaseModel


class StorageLocation(BaseModel):
    """A configurable lookup for where a route sends output that isn't
    continuing to another process (e.g. "Standard Warehouse", "Reject
    Store"). Same bare name+active shape as `apps.processes.ProcessCategory`
    — no Location/Warehouse master exists elsewhere in this codebase yet,
    so this is deliberately minimal rather than a full inventory location
    model.
    """

    name = models.CharField(max_length=100, unique=True)
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="storage_locations"
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class ProcessRoute(BaseModel):
    """A product's stable logical route identity (e.g. "Standard Plate
    Production") — name never changes across versions. Everything that's
    actually configured (steps, branching) lives on `ProcessRouteVersion`,
    mirroring `apps.processes.ProcessDefinition` / `ProcessDefinitionVersion`
    exactly: editing a route never reinterprets a version already selected
    by a plan/execution.
    """

    name = models.CharField(max_length=255)
    product = models.ForeignKey("products.Product", on_delete=models.PROTECT, related_name="routes")
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="process_routes"
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return f"{self.name} ({self.product})"

    def current_version(self) -> "ProcessRouteVersion | None":
        """The version the UI/API should read and write — the `ACTIVE` one
        if there is one, otherwise the latest `DRAFT`/`ARCHIVED` row.
        """
        return (
            self.versions.filter(status=ProcessRouteVersion.Status.ACTIVE).first()
            or self.versions.first()
        )


class ProcessRouteVersion(BaseModel):
    """One versioned configuration snapshot of a `ProcessRoute` — only a
    `DRAFT` version may be edited; once `ACTIVE` it's immutable (enforced in
    `views.py`), since a plan/execution that selects a route version must
    never have its routing silently reinterpreted. `ARCHIVED` marks a
    version superseded by a newer `ACTIVE` one (the spec calls this state
    "INACTIVE" — same concept, reusing the existing `ProcessDefinitionVersion`
    naming for consistency across the codebase rather than introducing a
    second word for the same thing).
    """

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        ACTIVE = "ACTIVE", "Active"
        ARCHIVED = "ARCHIVED", "Archived"

    process_route = models.ForeignKey(
        ProcessRoute, on_delete=models.CASCADE, related_name="versions"
    )
    version_number = models.PositiveIntegerField(editable=False)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    is_default = models.BooleanField(default=False)
    effective_from = models.DateField(null=True, blank=True)
    effective_to = models.DateField(null=True, blank=True)
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="process_route_versions"
    )

    class Meta:
        ordering = ["-version_number"]
        constraints = [
            models.UniqueConstraint(
                fields=["process_route", "version_number"], name="unique_route_version_per_route"
            )
        ]

    def __str__(self) -> str:
        return f"{self.process_route.name} v{self.version_number} ({self.status})"


class ProcessRouteNode(BaseModel):
    """One step on a `ProcessRouteVersion` — references a `ProcessDefinition`
    (stable identity), resolved dynamically to its current active version
    while the route version is `DRAFT`. `process_definition_version` is
    populated only at `activate()` time, pinning the exact version this
    route step used — mirroring how `ProcessDefinitionVersion` itself
    becomes immutable on activation, so a route that's already been
    selected by a plan never silently reinterprets which process
    configuration it meant if the process later gets a new active version.
    `sequence_hint` drives the wizard's default top-to-bottom display only;
    `ProcessRouteEdge` is the authoritative source of connectivity.
    """

    route_version = models.ForeignKey(
        ProcessRouteVersion, on_delete=models.CASCADE, related_name="nodes"
    )
    node_key = models.CharField(max_length=64)
    process_definition = models.ForeignKey(
        "processes.ProcessDefinition", on_delete=models.PROTECT, related_name="+"
    )
    process_definition_version = models.ForeignKey(
        "processes.ProcessDefinitionVersion",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
    )
    display_label = models.CharField(max_length=255, blank=True)
    sequence_hint = models.PositiveIntegerField()
    is_optional = models.BooleanField(default=False)
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="process_route_nodes"
    )

    class Meta:
        ordering = ["sequence_hint"]
        constraints = [
            models.UniqueConstraint(
                fields=["route_version", "node_key"], name="unique_node_key_per_version"
            )
        ]

    def __str__(self) -> str:
        return self.display_label or str(self.process_definition)


class ProcessRouteEdge(BaseModel):
    """One connection between route nodes — or a terminal disposition for a
    node's output. `source_output_definition` is null for a node's single
    default path forward; set to a specific
    `processes.ProcessOutputDefinition` row for branching nodes (e.g.
    Sorting's Premium/Standard/Reject outputs each get their own edge).
    `target_node` is set when `disposition_type` is `CONTINUE_TO_PROCESS`;
    `destination_location` is set when it's `MOVE_TO_STORAGE`.
    """

    class Disposition(models.TextChoices):
        CONTINUE_TO_PROCESS = "CONTINUE_TO_PROCESS", "Continue to Process"
        MOVE_TO_STORAGE = "MOVE_TO_STORAGE", "Move / Store"

    route_version = models.ForeignKey(
        ProcessRouteVersion, on_delete=models.CASCADE, related_name="edges"
    )
    source_node = models.ForeignKey(
        ProcessRouteNode, on_delete=models.CASCADE, related_name="outgoing_edges"
    )
    source_output_definition = models.ForeignKey(
        "processes.ProcessOutputDefinition",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
    )
    target_node = models.ForeignKey(
        ProcessRouteNode,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="incoming_edges",
    )
    disposition_type = models.CharField(max_length=20, choices=Disposition.choices)
    destination_location = models.ForeignKey(
        StorageLocation, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="process_route_edges"
    )

    def __str__(self) -> str:
        return f"{self.source_node} -> {self.target_node or self.destination_location}"
