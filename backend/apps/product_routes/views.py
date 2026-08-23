from typing import Any, cast

from django.db import transaction
from django.db.models import F, QuerySet
from rest_framework import filters, mixins, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import BasePermission
from rest_framework.request import Request
from rest_framework.response import Response

from apps.core.mixins import ProtectedDestroyMixin

from .models import (
    ProcessRoute,
    ProcessRouteEdge,
    ProcessRouteNode,
    ProcessRouteVersion,
    StorageLocation,
)
from .permissions import CanManageProductRoutes, IsInternalStaff
from .serializers import (
    ProcessRouteEdgeWriteSerializer,
    ProcessRouteNodeWriteSerializer,
    ProcessRouteSerializer,
    ProcessRouteVersionSerializer,
    StorageLocationSerializer,
    _slugify_node_key,
)


class StorageLocationViewSet(
    ProtectedDestroyMixin,
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """`is_active` is the usual deactivation mechanism; `destroy` is also
    available, blocked with a friendly error if any route edge still sends
    output to this location.
    """

    queryset = StorageLocation.objects.all()
    serializer_class = StorageLocationSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ["name"]

    def get_permissions(self) -> list[BasePermission]:
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [CanManageProductRoutes()]
        return [IsInternalStaff()]

    def get_queryset(self) -> QuerySet[StorageLocation]:
        queryset = super().get_queryset()
        is_active = self.request.query_params.get("is_active")
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() in ("true", "1"))
        return queryset


class ProcessRouteViewSet(
    ProtectedDestroyMixin,
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """`is_active` is the usual deactivation mechanism; `destroy` is also
    available for outright removal — nothing else references a
    `ProcessRoute` itself, so this always succeeds (its own versions/nodes/
    edges cascade with it). Creating a route also creates its version 1
    (`DRAFT`) transactionally — see `ProcessRouteSerializer.create`.
    """

    queryset = ProcessRoute.objects.select_related("item").prefetch_related(
        "versions__nodes__process_definition",
        "versions__edges",
    )
    serializer_class = ProcessRouteSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ["name"]

    def get_permissions(self) -> list[BasePermission]:
        if self.action in ("create", "update", "partial_update", "duplicate", "destroy"):
            return [CanManageProductRoutes()]
        return [IsInternalStaff()]

    def get_queryset(self) -> QuerySet[ProcessRoute]:
        queryset = super().get_queryset()

        is_active = self.request.query_params.get("is_active")
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() in ("true", "1"))

        item = self.request.query_params.get("item")
        if item is not None:
            queryset = queryset.filter(item_id=item)

        return queryset

    @action(detail=True, methods=["post"])
    def duplicate(self, request: Request, pk: str | None = None) -> Response:
        route = self.get_object()
        source_version = route.current_version()
        if source_version is None:
            raise serializers.ValidationError(
                {"detail": "This route has no configuration to copy."}
            )

        copy = ProcessRoute.objects.create(
            organization=route.organization,
            name=f"{route.name} (Copy)",
            item=route.item,
            is_active=True,
            created_by=cast(Any, request.user),
        )
        copy_version = ProcessRouteVersion.objects.create(
            process_route=copy,
            version_number=1,
            is_default=False,
            effective_from=source_version.effective_from,
            effective_to=source_version.effective_to,
            organization=copy.organization,
            created_by=cast(Any, request.user),
        )
        node_map: dict[int, ProcessRouteNode] = {}
        for node in source_version.nodes.all():
            copy_node = ProcessRouteNode.objects.create(
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
            ProcessRouteEdge.objects.create(
                route_version=copy_version,
                source_node=node_map[edge.source_node_id],
                source_output_definition=edge.source_output_definition,
                target_node=node_map[edge.target_node_id] if edge.target_node_id else None,
                disposition_type=edge.disposition_type,
                destination_location=edge.destination_location,
                organization=copy.organization,
            )

        serializer = self.get_serializer(copy)
        return Response(serializer.data, status=201)


class ProcessRouteVersionViewSet(
    mixins.RetrieveModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet
):
    """The wizard's edit surface for everything past Basics: the generic
    `update`/`partial_update` for `is_default`/effective dates, plus the
    `nodes`/`edges` whole-list-replace actions and `activate`.
    """

    queryset = ProcessRouteVersion.objects.select_related(
        "process_route", "process_route__item"
    ).prefetch_related(
        "nodes__process_definition",
        "nodes__process_definition_version",
        "edges",
    )
    serializer_class = ProcessRouteVersionSerializer

    def get_permissions(self) -> list[BasePermission]:
        if self.action in ("update", "partial_update", "nodes", "edges", "activate"):
            return [CanManageProductRoutes()]
        return [IsInternalStaff()]

    def perform_update(self, serializer: serializers.BaseSerializer[Any]) -> None:
        instance = cast(ProcessRouteVersion, serializer.instance)
        if instance.status != ProcessRouteVersion.Status.DRAFT:
            raise serializers.ValidationError({"detail": "Only a draft version can be edited."})
        serializer.save()

    @action(detail=True, methods=["patch"])
    def nodes(self, request: Request, pk: str | None = None) -> Response:
        version = self.get_object()
        if version.status != ProcessRouteVersion.Status.DRAFT:
            raise serializers.ValidationError({"detail": "Only a draft version can be edited."})

        data = cast(dict[str, Any], request.data)
        rows_serializer = ProcessRouteNodeWriteSerializer(data=data.get("nodes", []), many=True)
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
            # Reorder-safety two-phase update, same pattern as
            # apps.processes' inputs/outputs/parameters actions.
            version.nodes.filter(id__in=keep_ids).update(sequence_hint=F("sequence_hint") + 100000)

            saved_nodes: list[ProcessRouteNode] = []
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
                    ProcessRouteNode.objects.filter(id=row_id, route_version=version).update(
                        **defaults
                    )
                    node = ProcessRouteNode.objects.get(id=row_id)
                else:
                    node = ProcessRouteNode.objects.create(route_version=version, **defaults)
                saved_nodes.append(node)

            self._sync_linear_edges(version, saved_nodes)

        version.refresh_from_db()
        return Response(self.get_serializer(version).data)

    @staticmethod
    def _sync_linear_edges(version: ProcessRouteVersion, nodes: list[ProcessRouteNode]) -> None:
        """Auto-create/update the default forward edge for each
        non-branching node so linear routes need no manual edge work — per
        the spec, "Linear routes may auto-create default edges between
        adjacent steps for convenience." Branching nodes (more than one
        resolved output row) are left alone; their dispositions are
        configured explicitly via the `edges` action instead.
        """
        for current_node, next_node in zip(nodes, nodes[1:], strict=False):
            resolved_version = (
                current_node.process_definition_version
                or current_node.process_definition.current_version()
            )
            output_count = resolved_version.outputs.count() if resolved_version else 0
            if output_count > 1:
                continue
            existing = ProcessRouteEdge.objects.filter(
                route_version=version, source_node=current_node, source_output_definition=None
            ).first()
            if existing:
                if existing.target_node_id != next_node.id:
                    existing.target_node = next_node
                    existing.disposition_type = ProcessRouteEdge.Disposition.CONTINUE_TO_PROCESS
                    existing.destination_location = None
                    existing.save()
            else:
                ProcessRouteEdge.objects.create(
                    route_version=version,
                    source_node=current_node,
                    source_output_definition=None,
                    target_node=next_node,
                    disposition_type=ProcessRouteEdge.Disposition.CONTINUE_TO_PROCESS,
                    organization=version.organization,
                )

    @action(detail=True, methods=["patch"])
    def edges(self, request: Request, pk: str | None = None) -> Response:
        version = self.get_object()
        if version.status != ProcessRouteVersion.Status.DRAFT:
            raise serializers.ValidationError({"detail": "Only a draft version can be edited."})

        data = cast(dict[str, Any], request.data)
        rows_serializer = ProcessRouteEdgeWriteSerializer(data=data.get("edges", []), many=True)
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
                    ProcessRouteEdge.objects.filter(id=row_id, route_version=version).update(
                        **defaults
                    )
                else:
                    ProcessRouteEdge.objects.create(route_version=version, **defaults)

        version.refresh_from_db()
        return Response(self.get_serializer(version).data)

    @action(detail=True, methods=["post"])
    def activate(self, request: Request, pk: str | None = None) -> Response:
        version = self.get_object()
        if version.status != ProcessRouteVersion.Status.DRAFT:
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
            move_to_storage = ProcessRouteEdge.Disposition.MOVE_TO_STORAGE

            if output_count > 1 and resolved_version:
                # Branching node: every output needs its own disposition —
                # "no edges at all" means every output is unconfigured, not
                # an implicit terminal.
                configured = {
                    e.source_output_definition_id for e in outgoing if e.source_output_definition_id
                }
                all_output_ids = set(resolved_version.outputs.values_list("id", flat=True))
                if all_output_ids - configured:
                    errors.append(f'"{node}" has an output with no disposition configured.')
                if any(e.disposition_type == move_to_storage for e in outgoing):
                    has_terminal = True
            elif not outgoing:
                # Non-branching node with no edge: implicit terminal.
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

            version.process_route.versions.filter(status=ProcessRouteVersion.Status.ACTIVE).update(
                status=ProcessRouteVersion.Status.ARCHIVED
            )

            if version.is_default:
                ProcessRouteVersion.objects.filter(
                    process_route__item=version.process_route.item,
                    status=ProcessRouteVersion.Status.ACTIVE,
                    is_default=True,
                ).exclude(process_route=version.process_route).update(is_default=False)

            version.status = ProcessRouteVersion.Status.ACTIVE
            version.save(update_fields=["status"])

        version.refresh_from_db()
        return Response(self.get_serializer(version).data)
