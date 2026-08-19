from typing import Any, cast

from django.db.models import QuerySet
from rest_framework import filters, mixins, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import BasePermission
from rest_framework.request import Request
from rest_framework.response import Response

from .models import Process, ProcessCategory
from .permissions import CanManageProcesses, IsInternalStaff
from .serializers import ProcessCategorySerializer, ProcessSerializer


class ProcessCategoryViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """No delete route on purpose — `is_active` is the deactivation
    mechanism, same as `apps.materials.views.MaterialViewSet`.
    """

    queryset = ProcessCategory.objects.all()
    serializer_class = ProcessCategorySerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ["name"]

    def get_permissions(self) -> list[BasePermission]:
        if self.action in ("create", "update", "partial_update"):
            return [CanManageProcesses()]
        return [IsInternalStaff()]

    def get_queryset(self) -> QuerySet[ProcessCategory]:
        queryset = super().get_queryset()

        is_active = self.request.query_params.get("is_active")
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() in ("true", "1"))

        return queryset


class ProcessViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """No delete route on purpose — `is_active` is the deactivation
    mechanism, same as `apps.materials.views.MaterialViewSet`.
    """

    queryset = Process.objects.select_related("category").prefetch_related("inputs", "outputs")
    serializer_class = ProcessSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ["name"]

    def get_permissions(self) -> list[BasePermission]:
        if self.action in ("create", "update", "partial_update", "duplicate"):
            return [CanManageProcesses()]
        return [IsInternalStaff()]

    def get_queryset(self) -> QuerySet[Process]:
        queryset = super().get_queryset()

        is_active = self.request.query_params.get("is_active")
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() in ("true", "1"))

        category = self.request.query_params.get("category")
        if category is not None:
            queryset = queryset.filter(category_id=category)

        return queryset

    @action(detail=True, methods=["post"])
    def duplicate(self, request: Request, pk: str | None = None) -> Response:
        process = self.get_object()
        copy = Process.objects.create(
            organization=process.organization,
            name=f"{process.name} (Copy)",
            category=process.category,
            resource_type=process.resource_type,
            description=process.description,
            is_active=True,
            created_by=cast(Any, request.user),
        )
        copy.inputs.set(process.inputs.all())
        copy.outputs.set(process.outputs.all())
        serializer = self.get_serializer(copy)
        return Response(serializer.data, status=201)
