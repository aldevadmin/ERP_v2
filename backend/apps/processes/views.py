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
    OutputClassification,
    ProcessCategory,
    ProcessDefinition,
    ProcessDefinitionVersion,
    ProcessExecution,
    ProcessInputDefinition,
    ProcessOutputDefinition,
    ProcessParameterDefinition,
)
from .permissions import CanManageProcesses, CanRecordProcessExecutions, IsInternalStaff
from .serializers import (
    OutputClassificationSerializer,
    ProcessCategorySerializer,
    ProcessDefinitionSerializer,
    ProcessDefinitionVersionSerializer,
    ProcessExecutionSerializer,
    ProcessInputWriteSerializer,
    ProcessOutputWriteSerializer,
    ProcessParameterWriteSerializer,
)


class ProcessCategoryViewSet(
    ProtectedDestroyMixin,
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """`is_active` is the usual deactivation mechanism; `destroy` is also
    available for outright removal, blocked with a friendly error (via
    `ProtectedDestroyMixin`) if any Process still uses this category.
    """

    queryset = ProcessCategory.objects.all()
    serializer_class = ProcessCategorySerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ["name"]

    def get_permissions(self) -> list[BasePermission]:
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [CanManageProcesses()]
        return [IsInternalStaff()]

    def get_queryset(self) -> QuerySet[ProcessCategory]:
        queryset = super().get_queryset()

        is_active = self.request.query_params.get("is_active")
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() in ("true", "1"))

        return queryset


class OutputClassificationViewSet(
    ProtectedDestroyMixin,
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """`is_active` is the usual deactivation mechanism; `destroy` is also
    available, blocked with a friendly error if any Process output still
    uses this classification.
    """

    queryset = OutputClassification.objects.all()
    serializer_class = OutputClassificationSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ["name"]

    def get_permissions(self) -> list[BasePermission]:
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [CanManageProcesses()]
        return [IsInternalStaff()]

    def get_queryset(self) -> QuerySet[OutputClassification]:
        queryset = super().get_queryset()

        is_active = self.request.query_params.get("is_active")
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() in ("true", "1"))

        return queryset


class ProcessDefinitionViewSet(
    ProtectedDestroyMixin,
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """`is_active` is the usual deactivation mechanism; `destroy` is also
    available for outright removal — blocked with a friendly error (naming
    the Product Route(s) involved) if this process is still used in a
    route, a work centre capability, or a tooling compatibility. Creating a
    definition also creates its version 1 (`DRAFT`) transactionally — see
    `ProcessDefinitionSerializer.create`.
    """

    queryset = ProcessDefinition.objects.prefetch_related(
        "versions__category",
        "versions__inputs__item",
        "versions__outputs__item",
        "versions__outputs__classification",
        "versions__parameters",
    )
    serializer_class = ProcessDefinitionSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ["name", "code"]

    def get_permissions(self) -> list[BasePermission]:
        if self.action in ("create", "update", "partial_update", "duplicate", "destroy"):
            return [CanManageProcesses()]
        return [IsInternalStaff()]

    def get_queryset(self) -> QuerySet[ProcessDefinition]:
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

        copy = ProcessDefinition.objects.create(
            organization=definition.organization,
            name=f"{definition.name} (Copy)",
            code=self._unique_copy_code(definition.code),
            is_active=True,
            created_by=cast(Any, request.user),
        )
        copy_version = ProcessDefinitionVersion.objects.create(
            process_definition=copy,
            version_number=1,
            category=source_version.category,
            work_centre_requirement=source_version.work_centre_requirement,
            operator_required=source_version.operator_required,
            standard_rate_config_level=source_version.standard_rate_config_level,
            capture_mode=source_version.capture_mode,
            position_label=source_version.position_label,
            default_position_count=source_version.default_position_count,
            allow_work_centre_override=source_version.allow_work_centre_override,
            allow_different_sku_per_position=source_version.allow_different_sku_per_position,
            allow_manual_standard_rate=source_version.allow_manual_standard_rate,
            reserve_machine_derived_rate=source_version.reserve_machine_derived_rate,
            batch_lot_mode=source_version.batch_lot_mode,
            transaction_frequency=source_version.transaction_frequency,
            partial_output_forward=source_version.partial_output_forward,
            allow_over_production=source_version.allow_over_production,
            over_production_tolerance_percent=source_version.over_production_tolerance_percent,
            input_consumption_mode=source_version.input_consumption_mode,
            completion_mode=source_version.completion_mode,
            qc_requirement=source_version.qc_requirement,
            allow_correction_with_audit_trail=source_version.allow_correction_with_audit_trail,
            allow_destructive_delete=source_version.allow_destructive_delete,
            permit_machine_generated_source=source_version.permit_machine_generated_source,
            description=source_version.description,
            organization=copy.organization,
            created_by=cast(Any, request.user),
        )
        for input_row in source_version.inputs.all():
            ProcessInputDefinition.objects.create(
                process_version=copy_version,
                sequence=input_row.sequence,
                input_type=input_row.input_type,
                item=input_row.item,
                uom=input_row.uom,
                quantity_capture=input_row.quantity_capture,
                is_required=input_row.is_required,
                organization=copy.organization,
            )
        for output_row in source_version.outputs.all():
            ProcessOutputDefinition.objects.create(
                process_version=copy_version,
                sequence=output_row.sequence,
                item_type=output_row.item_type,
                item=output_row.item,
                uom=output_row.uom,
                classification=output_row.classification,
                can_move_forward=output_row.can_move_forward,
                creates_traceable_output=output_row.creates_traceable_output,
                default_storage_destination=output_row.default_storage_destination,
                organization=copy.organization,
            )
        for parameter_row in source_version.parameters.all():
            ProcessParameterDefinition.objects.create(
                process_version=copy_version,
                sequence=parameter_row.sequence,
                label=parameter_row.label,
                code=parameter_row.code,
                data_type=parameter_row.data_type,
                unit=parameter_row.unit,
                capture_at=parameter_row.capture_at,
                is_required=parameter_row.is_required,
                default_value=parameter_row.default_value,
                organization=copy.organization,
            )

        serializer = self.get_serializer(copy)
        return Response(serializer.data, status=201)

    @staticmethod
    def _unique_copy_code(base_code: str) -> str:
        candidate = f"{base_code}-COPY"
        suffix = 2
        while ProcessDefinition.objects.filter(code=candidate).exists():
            candidate = f"{base_code}-COPY-{suffix}"
            suffix += 1
        return candidate


class ProcessDefinitionVersionViewSet(
    mixins.RetrieveModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet
):
    """The wizard's edit surface for everything past Basics: the generic
    `update`/`partial_update` for each step's own scalar fields (Work
    Centre, Output Capture, Parameters' Performance flags, Rules), plus the
    `inputs`/`outputs`/`parameters` whole-list-replace actions and Step 8's
    `activate` action below.
    """

    queryset = ProcessDefinitionVersion.objects.select_related(
        "category", "process_definition"
    ).prefetch_related(
        "inputs__item",
        "outputs__item",
        "outputs__classification",
        "parameters",
    )
    serializer_class = ProcessDefinitionVersionSerializer

    def get_permissions(self) -> list[BasePermission]:
        if self.action in (
            "update",
            "partial_update",
            "inputs",
            "outputs",
            "parameters",
            "activate",
        ):
            return [CanManageProcesses()]
        return [IsInternalStaff()]

    def perform_update(self, serializer: serializers.BaseSerializer[Any]) -> None:
        instance = cast(ProcessDefinitionVersion, serializer.instance)
        if instance.status != ProcessDefinitionVersion.Status.DRAFT:
            raise serializers.ValidationError({"detail": "Only a draft version can be edited."})
        serializer.save()

    @action(detail=True, methods=["patch"])
    def inputs(self, request: Request, pk: str | None = None) -> Response:
        version = self.get_object()
        if version.status != ProcessDefinitionVersion.Status.DRAFT:
            raise serializers.ValidationError({"detail": "Only a draft version can be edited."})

        data = cast(dict[str, Any], request.data)
        rows_serializer = ProcessInputWriteSerializer(data=data.get("inputs", []), many=True)
        rows_serializer.is_valid(raise_exception=True)
        batch_lot_mode = data.get("batch_lot_mode")

        with transaction.atomic():
            if batch_lot_mode:
                version.batch_lot_mode = batch_lot_mode
                version.save(update_fields=["batch_lot_mode"])

            keep_ids = [row["id"] for row in rows_serializer.validated_data if row.get("id")]
            version.inputs.exclude(id__in=keep_ids).delete()
            # Push surviving rows' sequences out of range first — reassigning
            # in place risks a transient collision with the unique
            # (process_version, sequence) constraint when rows are reordered
            # (e.g. swapping 1<->2 hits "sequence 1 already exists" on the
            # first UPDATE, since the other row hasn't moved yet).
            version.inputs.filter(id__in=keep_ids).update(sequence=F("sequence") + 100000)

            for sequence, row in enumerate(rows_serializer.validated_data, start=1):
                row_id = row.get("id")
                input_type = row["input_type"]
                item = Item.objects.get(id=row["item"])
                defaults = {
                    "sequence": sequence,
                    "input_type": input_type,
                    "item": item,
                    "uom": row["uom"],
                    "quantity_capture": row["quantity_capture"],
                    "is_required": row["is_required"],
                    "organization": version.organization,
                }
                if row_id:
                    ProcessInputDefinition.objects.filter(
                        id=row_id, process_version=version
                    ).update(**defaults)
                else:
                    ProcessInputDefinition.objects.create(process_version=version, **defaults)

        # `get_object()` prefetched `inputs` before the writes above, and
        # Django doesn't auto-invalidate that cache — without this, the
        # response would still show the pre-write row set even though the
        # DB was updated correctly.
        version.refresh_from_db()
        return Response(self.get_serializer(version).data)

    @action(detail=True, methods=["patch"])
    def outputs(self, request: Request, pk: str | None = None) -> Response:
        version = self.get_object()
        if version.status != ProcessDefinitionVersion.Status.DRAFT:
            raise serializers.ValidationError({"detail": "Only a draft version can be edited."})

        data = cast(dict[str, Any], request.data)
        rows_serializer = ProcessOutputWriteSerializer(data=data.get("outputs", []), many=True)
        rows_serializer.is_valid(raise_exception=True)

        with transaction.atomic():
            keep_ids = [row["id"] for row in rows_serializer.validated_data if row.get("id")]
            version.outputs.exclude(id__in=keep_ids).delete()
            # Same reorder-safety two-phase update as `inputs` above — avoids a
            # transient collision with the unique (process_version, sequence)
            # constraint when existing rows are reordered.
            version.outputs.filter(id__in=keep_ids).update(sequence=F("sequence") + 100000)

            for sequence, row in enumerate(rows_serializer.validated_data, start=1):
                row_id = row.get("id")
                item_type = row["item_type"]
                item = Item.objects.get(id=row["item"])
                defaults = {
                    "sequence": sequence,
                    "item_type": item_type,
                    "item": item,
                    "uom": row["uom"],
                    "classification_id": row["classification"],
                    "can_move_forward": row["can_move_forward"],
                    "creates_traceable_output": row["creates_traceable_output"],
                    "default_storage_destination": row["default_storage_destination"],
                    "organization": version.organization,
                }
                if row_id:
                    ProcessOutputDefinition.objects.filter(
                        id=row_id, process_version=version
                    ).update(**defaults)
                else:
                    ProcessOutputDefinition.objects.create(process_version=version, **defaults)

        # See the matching comment in `inputs` above — same stale prefetch
        # cache issue.
        version.refresh_from_db()
        return Response(self.get_serializer(version).data)

    @action(detail=True, methods=["patch"])
    def parameters(self, request: Request, pk: str | None = None) -> Response:
        version = self.get_object()
        if version.status != ProcessDefinitionVersion.Status.DRAFT:
            raise serializers.ValidationError({"detail": "Only a draft version can be edited."})

        data = cast(dict[str, Any], request.data)
        rows_serializer = ProcessParameterWriteSerializer(
            data=data.get("parameters", []), many=True
        )
        rows_serializer.is_valid(raise_exception=True)

        codes = [row["code"] for row in rows_serializer.validated_data]
        if len(codes) != len(set(codes)):
            raise serializers.ValidationError(
                {"parameters": "Each parameter code must be unique within this process."}
            )

        with transaction.atomic():
            keep_ids = [row["id"] for row in rows_serializer.validated_data if row.get("id")]
            version.parameters.exclude(id__in=keep_ids).delete()
            # Same reorder-safety two-phase update as `inputs`/`outputs` above.
            version.parameters.filter(id__in=keep_ids).update(sequence=F("sequence") + 100000)

            for sequence, row in enumerate(rows_serializer.validated_data, start=1):
                row_id = row.get("id")
                defaults = {
                    "sequence": sequence,
                    "label": row["label"],
                    "code": row["code"],
                    "data_type": row["data_type"],
                    "unit": row["unit"],
                    "capture_at": row["capture_at"],
                    "is_required": row["is_required"],
                    "default_value": row["default_value"],
                    "organization": version.organization,
                }
                if row_id:
                    ProcessParameterDefinition.objects.filter(
                        id=row_id, process_version=version
                    ).update(**defaults)
                else:
                    ProcessParameterDefinition.objects.create(process_version=version, **defaults)

        # See the matching comment in `inputs` above — same stale prefetch
        # cache issue.
        version.refresh_from_db()
        return Response(self.get_serializer(version).data)

    @action(detail=True, methods=["post"])
    def activate(self, request: Request, pk: str | None = None) -> Response:
        """Step 8's Save & Activate. Blocking checks mirror the Review
        validation table; only the ones this schema can actually evaluate
        are enforced here — category-level "input required" and route
        connectivity aren't modeled, and duplicate parameter codes /
        enum+tolerance validity / valid position config are already
        guaranteed at save time by their own write-path validation, so
        they're not re-checked. Work-centre capability is a warning, not a
        blocker, per spec: a process may activate before machine/station
        mapping is complete.
        """
        version = self.get_object()
        if version.status != ProcessDefinitionVersion.Status.DRAFT:
            raise serializers.ValidationError({"detail": "Only a draft version can be activated."})

        errors: list[str] = []
        if not version.outputs.exists():
            errors.append("At least one output is required.")
        uses_positions = version.capture_mode in (
            ProcessDefinitionVersion.CaptureMode.POSITION_LEVEL,
            ProcessDefinitionVersion.CaptureMode.BOTH,
        )
        if (
            uses_positions
            and version.work_centre_requirement
            == ProcessDefinitionVersion.WorkCentreRequirement.NONE
        ):
            errors.append("Position-level output capture requires a work centre.")
        if uses_positions and (not version.position_label or not version.default_position_count):
            errors.append("Position label and default position count are required.")
        if errors:
            raise serializers.ValidationError({"detail": " • ".join(errors)})

        warnings: list[str] = []
        if not version.process_definition.work_centre_capabilities.exists():
            warnings.append("No work centre has been mapped to this process yet.")

        with transaction.atomic():
            version.process_definition.versions.filter(
                status=ProcessDefinitionVersion.Status.ACTIVE
            ).update(status=ProcessDefinitionVersion.Status.ARCHIVED)
            version.status = ProcessDefinitionVersion.Status.ACTIVE
            version.save(update_fields=["status"])

        data = dict(self.get_serializer(version).data)
        data["warnings"] = warnings
        return Response(data)


class ProcessExecutionViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """No delete — a recorded execution is a fact; corrections happen via
    PATCH (`update`), same no-destructive-edit rule as
    `ProductionTransaction`/`PackingTransaction` elsewhere in this
    codebase.
    """

    queryset = ProcessExecution.objects.select_related(
        "process_version__process_definition", "work_centre"
    ).prefetch_related("employees", "inputs__input_definition", "outputs__output_definition")
    serializer_class = ProcessExecutionSerializer

    def get_permissions(self) -> list[BasePermission]:
        return [CanRecordProcessExecutions()]

    def perform_create(self, serializer: serializers.BaseSerializer) -> None:
        serializer.save(created_by=self.request.user, updated_by=self.request.user)

    def perform_update(self, serializer: serializers.BaseSerializer) -> None:
        serializer.save(updated_by=self.request.user)

    def get_queryset(self) -> QuerySet[ProcessExecution]:
        queryset = super().get_queryset()

        process_definition = self.request.query_params.get("process_definition")
        if process_definition is not None:
            queryset = queryset.filter(
                process_version__process_definition_id=process_definition
            )

        work_centre = self.request.query_params.get("work_centre")
        if work_centre is not None:
            queryset = queryset.filter(work_centre_id=work_centre)

        export_order_line = self.request.query_params.get("export_order_line")
        if export_order_line is not None:
            queryset = queryset.filter(export_order_line_id=export_order_line)

        date_ = self.request.query_params.get("date")
        if date_ is not None:
            queryset = queryset.filter(date=date_)

        return queryset
