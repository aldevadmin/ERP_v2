from typing import Any, cast

from django.db import transaction
from django.db.models import F, QuerySet
from rest_framework import mixins, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.filters import SearchFilter
from rest_framework.permissions import BasePermission
from rest_framework.request import Request
from rest_framework.response import Response

from apps.core.mixins import ProtectedDestroyMixin
from apps.tooling.models import WorkCentrePosition
from apps.tooling.serializers import WorkCentrePositionWriteSerializer

from .models import Bay, WorkCentre, WorkCentreProcessCapability, WorkCentreType
from .permissions import CanManageWorkCentres, IsInternalStaff
from .serializers import (
    BaySerializer,
    WorkCentreCapabilityWriteSerializer,
    WorkCentreSerializer,
    WorkCentreTypeSerializer,
)


class BayViewSet(
    ProtectedDestroyMixin,
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """Same shape as `WorkCentreTypeViewSet` — `is_active` is the usual
    deactivation mechanism; `destroy` is blocked with a friendly error if
    any Work Centre still belongs to this Bay.
    """

    queryset = Bay.objects.all()
    serializer_class = BaySerializer
    filter_backends = [SearchFilter]
    search_fields = ["name", "code"]

    def get_permissions(self) -> list[BasePermission]:
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [CanManageWorkCentres()]
        return [IsInternalStaff()]

    def get_queryset(self) -> QuerySet[Bay]:
        queryset = super().get_queryset()

        is_active = self.request.query_params.get("is_active")
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() in ("true", "1"))

        return queryset


class WorkCentreTypeViewSet(
    ProtectedDestroyMixin,
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """`is_active` is the usual deactivation mechanism; `destroy` is also
    available, blocked with a friendly error if any Work Centre still uses
    this type.
    """

    queryset = WorkCentreType.objects.all()
    serializer_class = WorkCentreTypeSerializer
    filter_backends = [SearchFilter]
    search_fields = ["name"]

    def get_permissions(self) -> list[BasePermission]:
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [CanManageWorkCentres()]
        return [IsInternalStaff()]

    def get_queryset(self) -> QuerySet[WorkCentreType]:
        queryset = super().get_queryset()

        is_active = self.request.query_params.get("is_active")
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() in ("true", "1"))

        return queryset


class WorkCentreViewSet(
    ProtectedDestroyMixin,
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """`is_active` is the usual deactivation mechanism; `destroy` is also
    available for outright removal — blocked with a friendly error if any
    of its positions have tooling-assignment history (preserving that
    audit trail) or if a capability mapping can't be cleared. Bare
    positions/capabilities with no history cascade away with the work
    centre.
    """

    queryset = WorkCentre.objects.prefetch_related(
        "capabilities__process_definition",
        "positions__assignments__tooling",
        "positions__assignments__default_item",
    )
    serializer_class = WorkCentreSerializer
    filter_backends = [SearchFilter]
    search_fields = ["name", "code"]

    def get_permissions(self) -> list[BasePermission]:
        if self.action in (
            "create",
            "update",
            "partial_update",
            "capabilities",
            "positions",
            "destroy",
        ):
            return [CanManageWorkCentres()]
        return [IsInternalStaff()]

    def get_queryset(self) -> QuerySet[WorkCentre]:
        queryset = super().get_queryset()

        is_active = self.request.query_params.get("is_active")
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() in ("true", "1"))

        type_ = self.request.query_params.get("type")
        if type_ is not None:
            queryset = queryset.filter(type=type_)

        bay = self.request.query_params.get("bay")
        if bay is not None:
            queryset = queryset.filter(bay=bay)

        return queryset

    @action(detail=True, methods=["patch"])
    def capabilities(self, request: Request, pk: str | None = None) -> Response:
        work_centre = self.get_object()

        data = cast(dict[str, Any], request.data)
        rows_serializer = WorkCentreCapabilityWriteSerializer(
            data=data.get("capabilities", []), many=True
        )
        rows_serializer.is_valid(raise_exception=True)

        rows = rows_serializer.validated_data
        process_ids = [row["process_definition"].id for row in rows]
        if len(process_ids) != len(set(process_ids)):
            raise serializers.ValidationError(
                {"capabilities": "Each process can only be mapped once per work centre."}
            )

        with transaction.atomic():
            keep_ids = [row["id"] for row in rows if row.get("id")]
            work_centre.capabilities.exclude(id__in=keep_ids).delete()

            for row in rows:
                row_id = row.get("id")
                defaults = {
                    "process_definition": row["process_definition"],
                    "standard_rate": row["standard_rate"],
                    "organization": work_centre.organization,
                }
                if row_id:
                    WorkCentreProcessCapability.objects.filter(
                        id=row_id, work_centre=work_centre
                    ).update(**defaults)
                else:
                    WorkCentreProcessCapability.objects.create(work_centre=work_centre, **defaults)

        # `get_object()` prefetched `capabilities` before the writes above,
        # and Django doesn't auto-invalidate that cache — without this, the
        # response would still show the pre-write row set even though the
        # DB was updated correctly (see the identical fix in
        # apps.processes.views for the inputs/outputs/parameters actions).
        work_centre.refresh_from_db()
        return Response(self.get_serializer(work_centre).data)

    @action(detail=True, methods=["put"])
    def positions(self, request: Request, pk: str | None = None) -> Response:
        """Whole-list-replace for this work centre's physical positions —
        same pattern as `capabilities` above. Positions are independent of
        any process (a machine's physical position count doesn't change
        based on what runs there this shift); tooling assignment history on
        a removed position is preserved via `on_delete=CASCADE` only
        deleting the position row itself, not its own tooling/assignment
        master data.
        """
        work_centre = self.get_object()

        data = cast(dict[str, Any], request.data)
        rows_serializer = WorkCentrePositionWriteSerializer(
            data=data.get("positions", []), many=True
        )
        rows_serializer.is_valid(raise_exception=True)
        rows = rows_serializer.validated_data

        with transaction.atomic():
            keep_ids = [row["id"] for row in rows if row.get("id")]
            work_centre.positions.exclude(id__in=keep_ids).delete()
            # Reorder-safety two-phase update, same pattern used throughout
            # this codebase's other whole-list-replace actions.
            work_centre.positions.filter(id__in=keep_ids).update(
                position_index=F("position_index") + 100000
            )

            for index, row in enumerate(rows, start=1):
                row_id = row.get("id")
                defaults = {
                    "position_index": index,
                    "display_label": row["display_label"],
                    "is_active": row["is_active"],
                    "organization": work_centre.organization,
                }
                if row_id:
                    WorkCentrePosition.objects.filter(id=row_id, work_centre=work_centre).update(
                        **defaults
                    )
                else:
                    WorkCentrePosition.objects.create(work_centre=work_centre, **defaults)

        work_centre.refresh_from_db()
        return Response(self.get_serializer(work_centre).data)
