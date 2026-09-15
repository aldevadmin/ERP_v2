from typing import Any, cast

from django.db import transaction
from django.db.models import F, QuerySet
from rest_framework import filters, mixins, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import BasePermission
from rest_framework.request import Request
from rest_framework.response import Response

from apps.core.mixins import ProtectedDestroyMixin
from apps.items.models import ItemGroup

from .models import (
    ProcessDefinitionV1,
    ProcessDefinitionVersionV1,
    ProcessInputDefinitionV1,
    ProcessOutputDefinitionV1,
)
from .permissions import CanManageProcesses, IsInternalStaff
from .serializers import (
    ProcessDefinitionV1Serializer,
    ProcessDefinitionVersionV1Serializer,
    ProcessInputDefinitionV1WriteSerializer,
    ProcessOutputDefinitionV1WriteSerializer,
)


class ProcessDefinitionV1ViewSet(
    ProtectedDestroyMixin,
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """`is_active` is the usual deactivation mechanism; `destroy` is also
    available, blocked with a friendly error if this process is still used
    by a `product_routes_v1.ProcessRouteNodeV1`. Creating a definition also
    creates its version 1 (`DRAFT`) transactionally — see
    `ProcessDefinitionV1Serializer.create`.
    """

    queryset = ProcessDefinitionV1.objects.prefetch_related(
        "versions__category",
        "versions__inputs__item_group",
        "versions__outputs__item_group",
        "versions__outputs__classification",
    )
    serializer_class = ProcessDefinitionV1Serializer
    filter_backends = [filters.SearchFilter]
    search_fields = ["name", "code"]

    def get_permissions(self) -> list[BasePermission]:
        if self.action in ("create", "update", "partial_update", "duplicate", "destroy"):
            return [CanManageProcesses()]
        return [IsInternalStaff()]

    def get_queryset(self) -> QuerySet[ProcessDefinitionV1]:
        queryset = super().get_queryset()

        is_active = self.request.query_params.get("is_active")
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() in ("true", "1"))

        category = self.request.query_params.get("category")
        if category is not None:
            queryset = queryset.filter(versions__category_id=category).distinct()

        return queryset

    @action(detail=True, methods=["post"])
    def duplicate(self, request: Request, pk: str | None = None) -> Response:
        definition = self.get_object()
        source_version = definition.current_version()
        if source_version is None:
            raise serializers.ValidationError(
                {"detail": "This process has no configuration to copy."}
            )

        copy = ProcessDefinitionV1.objects.create(
            organization=definition.organization,
            name=f"{definition.name} (Copy)",
            code=self._unique_copy_code(definition.code),
            is_active=True,
            created_by=cast(Any, request.user),
        )
        copy_version = ProcessDefinitionVersionV1.objects.create(
            process_definition=copy,
            version_number=1,
            category=source_version.category,
            description=source_version.description,
            organization=copy.organization,
            created_by=cast(Any, request.user),
        )
        for input_row in source_version.inputs.all():
            ProcessInputDefinitionV1.objects.create(
                process_version=copy_version,
                sequence=input_row.sequence,
                item_group=input_row.item_group,
                uom=input_row.uom,
                is_required=input_row.is_required,
                organization=copy.organization,
            )
        for output_row in source_version.outputs.all():
            ProcessOutputDefinitionV1.objects.create(
                process_version=copy_version,
                sequence=output_row.sequence,
                item_group=output_row.item_group,
                classification=output_row.classification,
                uom=output_row.uom,
                can_move_forward=output_row.can_move_forward,
                creates_traceable_output=output_row.creates_traceable_output,
                organization=copy.organization,
            )

        serializer = self.get_serializer(copy)
        return Response(serializer.data, status=201)

    @staticmethod
    def _unique_copy_code(base_code: str) -> str:
        candidate = f"{base_code}-COPY"
        suffix = 2
        while ProcessDefinitionV1.objects.filter(code=candidate).exists():
            candidate = f"{base_code}-COPY-{suffix}"
            suffix += 1
        return candidate


class ProcessDefinitionVersionV1ViewSet(
    mixins.RetrieveModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet
):
    """Basics-shaped `update`/`partial_update` (category/description),
    plus the `inputs`/`outputs` whole-list-replace actions and `activate`.
    """

    queryset = ProcessDefinitionVersionV1.objects.select_related(
        "category", "process_definition"
    ).prefetch_related("inputs__item_group", "outputs__item_group", "outputs__classification")
    serializer_class = ProcessDefinitionVersionV1Serializer

    def get_permissions(self) -> list[BasePermission]:
        if self.action in ("update", "partial_update", "inputs", "outputs", "activate"):
            return [CanManageProcesses()]
        return [IsInternalStaff()]

    def perform_update(self, serializer: serializers.BaseSerializer[Any]) -> None:
        instance = cast(ProcessDefinitionVersionV1, serializer.instance)
        if instance.status != ProcessDefinitionVersionV1.Status.DRAFT:
            raise serializers.ValidationError({"detail": "Only a draft version can be edited."})
        serializer.save()

    @action(detail=True, methods=["patch"])
    def inputs(self, request: Request, pk: str | None = None) -> Response:
        version = self.get_object()
        if version.status != ProcessDefinitionVersionV1.Status.DRAFT:
            raise serializers.ValidationError({"detail": "Only a draft version can be edited."})

        data = cast(dict[str, Any], request.data)
        rows_serializer = ProcessInputDefinitionV1WriteSerializer(
            data=data.get("inputs", []), many=True
        )
        rows_serializer.is_valid(raise_exception=True)

        with transaction.atomic():
            keep_ids = [row["id"] for row in rows_serializer.validated_data if row.get("id")]
            version.inputs.exclude(id__in=keep_ids).delete()
            # Push surviving rows' sequences out of range first — avoids a
            # transient collision with the unique (process_version,
            # sequence) constraint when rows are reordered.
            version.inputs.filter(id__in=keep_ids).update(sequence=F("sequence") + 100000)

            for sequence, row in enumerate(rows_serializer.validated_data, start=1):
                row_id = row.get("id")
                item_group = ItemGroup.objects.get(id=row["item_group"])
                defaults = {
                    "sequence": sequence,
                    "item_group": item_group,
                    "uom": row["uom"],
                    "is_required": row["is_required"],
                    "organization": version.organization,
                }
                if row_id:
                    ProcessInputDefinitionV1.objects.filter(
                        id=row_id, process_version=version
                    ).update(**defaults)
                else:
                    ProcessInputDefinitionV1.objects.create(process_version=version, **defaults)

        # `get_object()` prefetched `inputs` before the writes above, and
        # Django doesn't auto-invalidate that cache.
        version.refresh_from_db()
        return Response(self.get_serializer(version).data)

    @action(detail=True, methods=["patch"])
    def outputs(self, request: Request, pk: str | None = None) -> Response:
        version = self.get_object()
        if version.status != ProcessDefinitionVersionV1.Status.DRAFT:
            raise serializers.ValidationError({"detail": "Only a draft version can be edited."})

        data = cast(dict[str, Any], request.data)
        rows_serializer = ProcessOutputDefinitionV1WriteSerializer(
            data=data.get("outputs", []), many=True
        )
        rows_serializer.is_valid(raise_exception=True)

        with transaction.atomic():
            keep_ids = [row["id"] for row in rows_serializer.validated_data if row.get("id")]
            version.outputs.exclude(id__in=keep_ids).delete()
            version.outputs.filter(id__in=keep_ids).update(sequence=F("sequence") + 100000)

            for sequence, row in enumerate(rows_serializer.validated_data, start=1):
                row_id = row.get("id")
                item_group = ItemGroup.objects.get(id=row["item_group"])
                defaults = {
                    "sequence": sequence,
                    "item_group": item_group,
                    "classification_id": row.get("classification"),
                    "uom": row["uom"],
                    "can_move_forward": row["can_move_forward"],
                    "creates_traceable_output": row["creates_traceable_output"],
                    "organization": version.organization,
                }
                if row_id:
                    ProcessOutputDefinitionV1.objects.filter(
                        id=row_id, process_version=version
                    ).update(**defaults)
                else:
                    ProcessOutputDefinitionV1.objects.create(process_version=version, **defaults)

        version.refresh_from_db()
        return Response(self.get_serializer(version).data)

    @action(detail=True, methods=["post"])
    def activate(self, request: Request, pk: str | None = None) -> Response:
        """Only blocking check: at least one output is required — this
        engine has no work-centre/position/batch-lot config to validate
        against, unlike the original `processes.ProcessDefinitionVersion`.
        """
        version = self.get_object()
        if version.status != ProcessDefinitionVersionV1.Status.DRAFT:
            raise serializers.ValidationError({"detail": "Only a draft version can be activated."})

        if not version.outputs.exists():
            raise serializers.ValidationError({"detail": "At least one output is required."})

        with transaction.atomic():
            version.process_definition.versions.filter(
                status=ProcessDefinitionVersionV1.Status.ACTIVE
            ).update(status=ProcessDefinitionVersionV1.Status.ARCHIVED)
            version.status = ProcessDefinitionVersionV1.Status.ACTIVE
            version.save(update_fields=["status"])

        return Response(self.get_serializer(version).data)
