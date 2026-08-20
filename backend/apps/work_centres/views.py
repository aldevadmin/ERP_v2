from typing import Any, cast

from django.db import transaction
from django.db.models import QuerySet
from rest_framework import mixins, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.filters import SearchFilter
from rest_framework.permissions import BasePermission
from rest_framework.request import Request
from rest_framework.response import Response

from .models import WorkCentre, WorkCentreProcessCapability
from .permissions import CanManageWorkCentres, IsInternalStaff
from .serializers import WorkCentreCapabilityWriteSerializer, WorkCentreSerializer


class WorkCentreViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """No delete route on purpose — `is_active` is the deactivation
    mechanism, same as `apps.materials.views.MaterialViewSet`.
    """

    queryset = WorkCentre.objects.prefetch_related("capabilities__process_definition")
    serializer_class = WorkCentreSerializer
    filter_backends = [SearchFilter]
    search_fields = ["name", "code"]

    def get_permissions(self) -> list[BasePermission]:
        if self.action in ("create", "update", "partial_update", "capabilities"):
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

        return Response(self.get_serializer(work_centre).data)
