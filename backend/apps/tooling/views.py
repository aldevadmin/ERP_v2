from typing import Any, cast

from django.db import transaction
from django.db.models import QuerySet
from django.utils import timezone
from rest_framework import filters, mixins, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import BasePermission
from rest_framework.request import Request
from rest_framework.response import Response

from apps.core.mixins import ProtectedDestroyMixin

from .models import (
    Tooling,
    ToolingAssignment,
    ToolingCompatibility,
    ToolingType,
    WorkCentrePosition,
)
from .permissions import CanManageTooling, IsInternalStaff
from .serializers import (
    ToolingAssignmentSerializer,
    ToolingAssignmentWriteSerializer,
    ToolingCompatibilityWriteSerializer,
    ToolingSerializer,
    ToolingTypeSerializer,
    WorkCentrePositionSerializer,
)


class ToolingTypeViewSet(
    ProtectedDestroyMixin,
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """`is_active` is the usual deactivation mechanism; `destroy` is also
    available, blocked with a friendly error if any Tooling still uses
    this type.
    """

    queryset = ToolingType.objects.all()
    serializer_class = ToolingTypeSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ["name"]

    def get_permissions(self) -> list[BasePermission]:
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [CanManageTooling()]
        return [IsInternalStaff()]

    def get_queryset(self) -> QuerySet[ToolingType]:
        queryset = super().get_queryset()

        is_active = self.request.query_params.get("is_active")
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() in ("true", "1"))

        return queryset


class ToolingViewSet(
    ProtectedDestroyMixin,
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """`is_active` is the usual deactivation mechanism; `destroy` is also
    available for outright removal — blocked with a friendly error if this
    tooling has any assignment history (`ToolingAssignment.tooling` is
    PROTECT, preserving that audit trail). Bare compatibility rows with no
    assignment history cascade away with it.
    """

    queryset = Tooling.objects.prefetch_related("compatibilities__product")
    serializer_class = ToolingSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ["name", "code"]

    def get_permissions(self) -> list[BasePermission]:
        if self.action in ("create", "update", "partial_update", "compatibilities", "destroy"):
            return [CanManageTooling()]
        return [IsInternalStaff()]

    def get_queryset(self) -> QuerySet[Tooling]:
        queryset = super().get_queryset()

        is_active = self.request.query_params.get("is_active")
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() in ("true", "1"))

        tooling_type = self.request.query_params.get("type")
        if tooling_type is not None:
            queryset = queryset.filter(tooling_type=tooling_type)

        item_id = self.request.query_params.get("item_id")
        if item_id is not None:
            queryset = queryset.filter(compatibilities__product_id=item_id).distinct()

        return queryset

    @action(detail=True, methods=["put"])
    def compatibilities(self, request: Request, pk: str | None = None) -> Response:
        tooling = self.get_object()
        data = cast(dict[str, Any], request.data)
        rows_serializer = ToolingCompatibilityWriteSerializer(
            data=data.get("compatibilities", []), many=True
        )
        rows_serializer.is_valid(raise_exception=True)

        with transaction.atomic():
            keep_ids = [row["id"] for row in rows_serializer.validated_data if row.get("id")]
            tooling.compatibilities.exclude(id__in=keep_ids).delete()

            for row in rows_serializer.validated_data:
                row_id = row.get("id")
                defaults = {
                    "product": row["product"],
                    "process_definition": row.get("process_definition"),
                    "organization": tooling.organization,
                }
                if row_id:
                    ToolingCompatibility.objects.filter(id=row_id, tooling=tooling).update(
                        **defaults
                    )
                else:
                    ToolingCompatibility.objects.create(tooling=tooling, **defaults)

        # See apps.processes.views' identical fix on the inputs/outputs/
        # parameters actions: `get_object()` prefetched `compatibilities`
        # before the writes above, and Django doesn't auto-invalidate that
        # cache.
        tooling.refresh_from_db()
        return Response(self.get_serializer(tooling).data)


class WorkCentrePositionViewSet(mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Positions themselves are listed/edited as a whole list via
    `apps.work_centres.WorkCentreViewSet.positions` — this viewset exists so
    a single position has somewhere to host its own `assignments` history
    and changeover action.
    """

    queryset = WorkCentrePosition.objects.select_related("work_centre")
    serializer_class = WorkCentrePositionSerializer

    def get_permissions(self) -> list[BasePermission]:
        return [IsInternalStaff()]

    @action(detail=True, methods=["get", "post"])
    def assignments(self, request: Request, pk: str | None = None) -> Response:
        position = self.get_object()

        if request.method == "GET":
            history = position.assignments.select_related("tooling", "default_item").all()
            return Response(ToolingAssignmentSerializer(history, many=True).data)

        if not CanManageTooling().has_permission(request, self):
            self.permission_denied(request)

        row_serializer = ToolingAssignmentWriteSerializer(data=request.data)
        row_serializer.is_valid(raise_exception=True)
        data = row_serializer.validated_data

        tooling = data["tooling"]
        default_item = data.get("default_item")
        effective_from = data["effective_from"]

        if default_item and not tooling.compatibilities.filter(product=default_item).exists():
            raise serializers.ValidationError(
                {"default_item": "This tooling is not compatible with the selected item."}
            )

        conflicting = ToolingAssignment.objects.filter(
            tooling=tooling, effective_to__isnull=True
        ).exclude(work_centre_position=position)
        if conflicting.exists():
            raise serializers.ValidationError(
                {"tooling": "This tooling is currently assigned to another position."}
            )

        with transaction.atomic():
            current = (
                position.assignments.select_for_update().filter(effective_to__isnull=True).first()
            )
            if current:
                if effective_from < current.effective_from:
                    raise serializers.ValidationError(
                        {"effective_from": "Cannot backdate before the current assignment started."}
                    )
                current.effective_to = effective_from
                current.save(update_fields=["effective_to"])

            new_assignment = ToolingAssignment.objects.create(
                tooling=tooling,
                work_centre_position=position,
                default_item=default_item,
                standard_rate_override=data.get("standard_rate_override"),
                effective_from=effective_from,
                notes=data.get("notes", ""),
                organization=position.organization,
            )

        return Response(ToolingAssignmentSerializer(new_assignment).data, status=201)


class ToolingAssignmentViewSet(mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    queryset = ToolingAssignment.objects.select_related("tooling", "work_centre_position")
    serializer_class = ToolingAssignmentSerializer

    def get_permissions(self) -> list[BasePermission]:
        if self.action == "end":
            return [CanManageTooling()]
        return [IsInternalStaff()]

    @action(detail=True, methods=["post"])
    def end(self, request: Request, pk: str | None = None) -> Response:
        assignment = self.get_object()
        if assignment.effective_to is not None:
            raise serializers.ValidationError({"detail": "This assignment is already closed."})

        effective_to = cast(dict[str, Any], request.data).get("effective_to") or timezone.now()
        assignment.effective_to = effective_to
        assignment.save(update_fields=["effective_to"])
        return Response(self.get_serializer(assignment).data)
