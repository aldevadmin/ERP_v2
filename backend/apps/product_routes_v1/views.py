from typing import Any, cast

from django.db import transaction
from django.db.models import F, QuerySet
from rest_framework import filters, mixins, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import BasePermission
from rest_framework.request import Request
from rest_framework.response import Response

from apps.core.mixins import ProtectedDestroyMixin
from apps.items.models import Item

from .models import (
    ProcessRouteEdgeV1,
    ProcessRouteItemMappingV1,
    ProcessRouteNodeV1,
    ProcessRouteV1,
    ProcessRouteVersionV1,
)
from .permissions import CanManageProductRoutes, IsInternalStaff
from .serializers import (
    ProcessRouteEdgeV1WriteSerializer,
    ProcessRouteItemMappingV1WriteSerializer,
    ProcessRouteNodeV1WriteSerializer,
    ProcessRouteV1Serializer,
    ProcessRouteVersionV1Serializer,
    _slugify_node_key,
)


class ProcessRouteV1ViewSet(
    ProtectedDestroyMixin,
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """`is_active` is the usual deactivation mechanism; `destroy` is also
    available — nothing else references a `ProcessRouteV1` itself, so this
    always succeeds (its versions/nodes/edges/item_mappings cascade with
    it). Creating a route also creates its version 1 (`DRAFT`)
    transactionally — see `ProcessRouteV1Serializer.create`.
    """

    queryset = ProcessRouteV1.objects.select_related("item_group").prefetch_related(
        "versions__nodes__process_definition",
        "versions__edges",
        "versions__item_mappings",
    )
    serializer_class = ProcessRouteV1Serializer
    filter_backends = [filters.SearchFilter]
    search_fields = ["name"]

    def get_permissions(self) -> list[BasePermission]:
        if self.action in ("create", "update", "partial_update", "duplicate", "destroy"):
            return [CanManageProductRoutes()]
        return [IsInternalStaff()]

    def get_queryset(self) -> QuerySet[ProcessRouteV1]:
        queryset = super().get_queryset()

        is_active = self.request.query_params.get("is_active")
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() in ("true", "1"))

        item_group = self.request.query_params.get("item_group")
        if item_group is not None:
            queryset = queryset.filter(item_group_id=item_group)

        return queryset

    @action(detail=True, methods=["post"])
    def duplicate(self, request: Request, pk: str | None = None) -> Response:
        route = self.get_object()
        source_version = route.current_version()
        if source_version is None:
            raise serializers.ValidationError(
                {"detail": "This route has no configuration to copy."}
            )

        copy = ProcessRouteV1.objects.create(
            organization=route.organization,
            name=f"{route.name} (Copy)",
            item_group=route.item_group,
            is_active=True,
            created_by=cast(Any, request.user),
        )
        copy_version = ProcessRouteVersionV1.objects.create(
            process_route=copy,
            version_number=1,
            is_default=False,
            effective_from=source_version.effective_from,
            effective_to=source_version.effective_to,
            organization=copy.organization,
            created_by=cast(Any, request.user),
        )
        node_map: dict[int, ProcessRouteNodeV1] = {}
        for node in source_version.nodes.all():
            copy_node = ProcessRouteNodeV1.objects.create(
                route_version=copy_version,
                node_key=node.node_key,
                process_definition=node.process_definition,
                display_label=node.display_label,
                sequence_hint=node.sequence_hint,
                is_optional=node.is_optional,
                organization=copy.organization,
            )
            node_map[node.id] = copy_node
        for edge in source_version.edges.all():
            ProcessRouteEdgeV1.objects.create(
                route_version=copy_version,
                source_node=node_map[edge.source_node_id],
                source_output_definition=edge.source_output_definition,
                target_node=node_map[edge.target_node_id] if edge.target_node_id else None,
                disposition_type=edge.disposition_type,
                destination_location=edge.destination_location,
                organization=copy.organization,
            )
        for mapping in source_version.item_mappings.all():
            ProcessRouteItemMappingV1.objects.create(
                route_version=copy_version,
                node=node_map[mapping.node_id],
                input_definition=mapping.input_definition,
                output_definition=mapping.output_definition,
                target_item=mapping.target_item,
                resolved_item=mapping.resolved_item,
                organization=copy.organization,
            )

        serializer = self.get_serializer(copy)
        return Response(serializer.data, status=201)


class ProcessRouteVersionV1ViewSet(
    mixins.RetrieveModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet
):
    """The wizard's edit surface for everything past Basics: the generic
    `update`/`partial_update` for `is_default`/effective dates, plus the
    `nodes`/`edges`/`item_mappings` whole-list-replace actions and
    `activate`.
    """

    queryset = ProcessRouteVersionV1.objects.select_related(
        "process_route", "process_route__item_group"
    ).prefetch_related(
        "nodes__process_definition",
        "nodes__process_definition_version",
        "edges",
        "item_mappings",
    )
    serializer_class = ProcessRouteVersionV1Serializer

    def get_permissions(self) -> list[BasePermission]:
        if self.action in (
            "update",
            "partial_update",
            "nodes",
            "edges",
            "item_mappings",
            "activate",
        ):
            return [CanManageProductRoutes()]
        return [IsInternalStaff()]

    def perform_update(self, serializer: serializers.BaseSerializer[Any]) -> None:
        instance = cast(ProcessRouteVersionV1, serializer.instance)
        if instance.status != ProcessRouteVersionV1.Status.DRAFT:
            raise serializers.ValidationError({"detail": "Only a draft version can be edited."})
        serializer.save()

    @action(detail=True, methods=["patch"])
    def nodes(self, request: Request, pk: str | None = None) -> Response:
        version = self.get_object()
        if version.status != ProcessRouteVersionV1.Status.DRAFT:
            raise serializers.ValidationError({"detail": "Only a draft version can be edited."})

        data = cast(dict[str, Any], request.data)
        rows_serializer = ProcessRouteNodeV1WriteSerializer(data=data.get("nodes", []), many=True)
        rows_serializer.is_valid(raise_exception=True)

        used_keys: set[str] = set()
        node_keys: list[str] = []
        for row in rows_serializer.validated_data:
            key = row.get("node_key") or _slugify_node_key(row["process_definition"].name)
            candidate = key
            suffix = 2
            while candidate in used_keys:
                candidate = f"{key}-{suffix}"
                suffix += 1
            used_keys.add(candidate)
            node_keys.append(candidate)

        with transaction.atomic():
            keep_ids = [row["id"] for row in rows_serializer.validated_data if row.get("id")]
            version.nodes.exclude(id__in=keep_ids).delete()
            version.nodes.filter(id__in=keep_ids).update(sequence_hint=F("sequence_hint") + 100000)

            saved_nodes: list[ProcessRouteNodeV1] = []
            for sequence, (row, node_key) in enumerate(
                zip(rows_serializer.validated_data, node_keys, strict=True), start=1
            ):
                row_id = row.get("id")
                defaults = {
                    "node_key": node_key,
                    "process_definition": row["process_definition"],
                    "display_label": row["display_label"],
                    "sequence_hint": sequence,
                    "is_optional": row["is_optional"],
                    "organization": version.organization,
                }
                if row_id:
                    ProcessRouteNodeV1.objects.filter(id=row_id, route_version=version).update(
                        **defaults
                    )
                    node = ProcessRouteNodeV1.objects.get(id=row_id)
                else:
                    node = ProcessRouteNodeV1.objects.create(route_version=version, **defaults)
                saved_nodes.append(node)

            self._sync_linear_edges(version, saved_nodes)

        version.refresh_from_db()
        return Response(self.get_serializer(version).data)

    @staticmethod
    def _sync_linear_edges(version: ProcessRouteVersionV1, nodes: list[ProcessRouteNodeV1]) -> None:
        """Auto-create/update the default forward edge for each
        non-branching node so linear routes need no manual edge work.
        Branching nodes (more than one resolved output row) are left
        alone; their dispositions are configured explicitly via `edges`.
        """
        for current_node, next_node in zip(nodes, nodes[1:], strict=False):
            resolved_version = (
                current_node.process_definition_version
                or current_node.process_definition.current_version()
            )
            output_count = resolved_version.outputs.count() if resolved_version else 0
            if output_count > 1:
                continue
            existing = ProcessRouteEdgeV1.objects.filter(
                route_version=version, source_node=current_node, source_output_definition=None
            ).first()
            if existing:
                if existing.target_node_id != next_node.id:
                    existing.target_node = next_node
                    existing.disposition_type = ProcessRouteEdgeV1.Disposition.CONTINUE_TO_PROCESS
                    existing.destination_location = None
                    existing.save()
            else:
                ProcessRouteEdgeV1.objects.create(
                    route_version=version,
                    source_node=current_node,
                    source_output_definition=None,
                    target_node=next_node,
                    disposition_type=ProcessRouteEdgeV1.Disposition.CONTINUE_TO_PROCESS,
                    organization=version.organization,
                )

    @action(detail=True, methods=["patch"])
    def edges(self, request: Request, pk: str | None = None) -> Response:
        version = self.get_object()
        if version.status != ProcessRouteVersionV1.Status.DRAFT:
            raise serializers.ValidationError({"detail": "Only a draft version can be edited."})

        data = cast(dict[str, Any], request.data)
        rows_serializer = ProcessRouteEdgeV1WriteSerializer(data=data.get("edges", []), many=True)
        rows_serializer.is_valid(raise_exception=True)

        node_ids = set(version.nodes.values_list("id", flat=True))
        for row in rows_serializer.validated_data:
            if row["source_node"].id not in node_ids:
                raise serializers.ValidationError(
                    {"edges": "source_node must belong to this route version."}
                )
            target = row.get("target_node")
            if target and target.id not in node_ids:
                raise serializers.ValidationError(
                    {"edges": "target_node must belong to this route version."}
                )
            source_output = row.get("source_output_definition")
            if source_output is not None:
                node_process_version = (
                    row["source_node"].process_definition_version
                    or row["source_node"].process_definition.current_version()
                )
                if (
                    node_process_version is None
                    or source_output.process_version_id != node_process_version.id
                ):
                    raise serializers.ValidationError(
                        {"source_output_definition": "Must belong to the source node's process."}
                    )

        with transaction.atomic():
            keep_ids = [row["id"] for row in rows_serializer.validated_data if row.get("id")]
            version.edges.exclude(id__in=keep_ids).delete()

            for row in rows_serializer.validated_data:
                row_id = row.get("id")
                defaults = {
                    "source_node": row["source_node"],
                    "source_output_definition": row.get("source_output_definition"),
                    "target_node": row.get("target_node"),
                    "disposition_type": row["disposition_type"],
                    "destination_location": row.get("destination_location"),
                    "organization": version.organization,
                }
                if row_id:
                    ProcessRouteEdgeV1.objects.filter(id=row_id, route_version=version).update(
                        **defaults
                    )
                else:
                    ProcessRouteEdgeV1.objects.create(route_version=version, **defaults)

        version.refresh_from_db()
        return Response(self.get_serializer(version).data)

    @action(detail=True, methods=["patch"])
    def item_mappings(self, request: Request, pk: str | None = None) -> Response:
        version = self.get_object()
        if version.status != ProcessRouteVersionV1.Status.DRAFT:
            raise serializers.ValidationError({"detail": "Only a draft version can be edited."})

        data = cast(dict[str, Any], request.data)
        rows_serializer = ProcessRouteItemMappingV1WriteSerializer(
            data=data.get("item_mappings", []), many=True
        )
        rows_serializer.is_valid(raise_exception=True)

        node_ids = set(version.nodes.values_list("id", flat=True))
        for row in rows_serializer.validated_data:
            node = row["node"]
            if node.id not in node_ids:
                raise serializers.ValidationError(
                    {"item_mappings": "node must belong to this route version."}
                )
            definition = row.get("input_definition") or row["output_definition"]
            node_process_version = node.process_definition_version or node.process_definition.current_version()
            if node_process_version is None or definition.process_version_id != node_process_version.id:
                raise serializers.ValidationError(
                    {"item_mappings": "This slot does not belong to the node's process."}
                )
            target_item = row["target_item"]
            # Deliberately NOT checking target_item.item_group == route's own
            # item_group here: a route's own group is a broad, descriptive
            # label for browsing/filtering ("this route is for the Plate
            # family"), while a real finished item's own group is typically
            # much narrower and size-specific ("FG Plate Areca Sq10x10") —
            # requiring exact equality would make it impossible for one
            # route to ever serve more than one size, defeating the entire
            # point of this generalization. Each definition-level match
            # (checked below, per row) is the real per-slot safety check;
            # which target_items get registered against a route is left to
            # admin judgment, same as everything else about Item Group.
            if target_item.item_class not in (Item.ItemClass.WIP, Item.ItemClass.FINISHED_GOOD):
                raise serializers.ValidationError(
                    {"target_item": "Target item must be WIP or Finished Good."}
                )

        with transaction.atomic():
            keep_ids = [row["id"] for row in rows_serializer.validated_data if row.get("id")]
            version.item_mappings.exclude(id__in=keep_ids).delete()

            for row in rows_serializer.validated_data:
                row_id = row.get("id")
                defaults = {
                    "node": row["node"],
                    "input_definition": row.get("input_definition"),
                    "output_definition": row.get("output_definition"),
                    "target_item": row["target_item"],
                    "resolved_item": row["resolved_item"],
                    "organization": version.organization,
                }
                if row_id:
                    ProcessRouteItemMappingV1.objects.filter(
                        id=row_id, route_version=version
                    ).update(**defaults)
                else:
                    ProcessRouteItemMappingV1.objects.create(route_version=version, **defaults)

        version.refresh_from_db()
        return Response(self.get_serializer(version).data)

    @action(detail=True, methods=["post"])
    def activate(self, request: Request, pk: str | None = None) -> Response:
        version = self.get_object()
        if version.status != ProcessRouteVersionV1.Status.DRAFT:
            raise serializers.ValidationError({"detail": "Only a draft version can be activated."})

        nodes = list(version.nodes.all().order_by("sequence_hint"))
        errors: list[str] = []
        if not nodes:
            errors.append("At least one step is required.")

        start_node_id = nodes[0].id if nodes else None
        incoming_targets = set(
            version.edges.exclude(target_node=None).values_list("target_node_id", flat=True)
        )
        for node in nodes:
            if node.id != start_node_id and node.id not in incoming_targets:
                errors.append(f'"{node}" has no incoming step — routes may have only one start.')

        has_terminal = False
        for node in nodes:
            resolved_version = (
                node.process_definition_version or node.process_definition.current_version()
            )
            output_count = resolved_version.outputs.count() if resolved_version else 0
            outgoing = list(version.edges.filter(source_node=node))
            move_to_storage = ProcessRouteEdgeV1.Disposition.MOVE_TO_STORAGE

            if output_count > 1 and resolved_version:
                configured = {
                    e.source_output_definition_id for e in outgoing if e.source_output_definition_id
                }
                all_output_ids = set(resolved_version.outputs.values_list("id", flat=True))
                if all_output_ids - configured:
                    errors.append(f'"{node}" has an output with no disposition configured.')
                if any(e.disposition_type == move_to_storage for e in outgoing):
                    has_terminal = True
            elif not outgoing:
                has_terminal = True
            elif any(e.disposition_type == move_to_storage for e in outgoing):
                has_terminal = True
        if not has_terminal:
            errors.append("At least one terminal step or disposition is required.")

        if errors:
            raise serializers.ValidationError({"detail": " • ".join(errors)})

        with transaction.atomic():
            for node in nodes:
                node.process_definition_version = node.process_definition.current_version()
                node.save(update_fields=["process_definition_version"])

            version.process_route.versions.filter(
                status=ProcessRouteVersionV1.Status.ACTIVE
            ).update(status=ProcessRouteVersionV1.Status.ARCHIVED)

            if version.is_default:
                ProcessRouteVersionV1.objects.filter(
                    process_route__item_group=version.process_route.item_group,
                    status=ProcessRouteVersionV1.Status.ACTIVE,
                    is_default=True,
                ).exclude(process_route=version.process_route).update(is_default=False)

            version.status = ProcessRouteVersionV1.Status.ACTIVE
            version.save(update_fields=["status"])

        version.refresh_from_db()
        return Response(self.get_serializer(version).data)
