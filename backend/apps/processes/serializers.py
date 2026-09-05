from typing import Any

from django.db import transaction
from rest_framework import serializers

from apps.accounts.models import Employee
from apps.core.models import Organization
from apps.items.models import Item

from .models import (
    OutputClassification,
    ProcessCategory,
    ProcessDefinition,
    ProcessDefinitionVersion,
    ProcessExecution,
    ProcessExecutionInput,
    ProcessExecutionOutput,
    ProcessInputDefinition,
    ProcessOutputDefinition,
    ProcessParameterDefinition,
)


class ProcessCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ProcessCategory
        fields = ["id", "name", "is_active"]

    def create(self, validated_data: dict[str, Any]) -> ProcessCategory:
        return ProcessCategory.objects.create(
            organization=Organization.get_default(), **validated_data
        )


class ProcessInputDefinitionSerializer(serializers.ModelSerializer):
    """Read-only representation nested inside a version. Writes go through
    `ProcessInputWriteSerializer` + `ProcessDefinitionVersionViewSet.inputs`
    (a whole-list-replace action), not this serializer directly.
    """

    item_id = serializers.SerializerMethodField()
    item_label = serializers.SerializerMethodField()

    class Meta:
        model = ProcessInputDefinition
        fields = [
            "id",
            "sequence",
            "input_type",
            "item_id",
            "item_label",
            "uom",
            "quantity_capture",
            "is_required",
        ]

    def get_item_id(self, obj: ProcessInputDefinition) -> int | None:
        return obj.item_id

    def get_item_label(self, obj: ProcessInputDefinition) -> str:
        item = obj.item
        if item is None:
            return ""
        return f"{item.name} ({item.code})"


class ProcessInputWriteSerializer(serializers.Serializer):
    """Validates one row of the `inputs` whole-list-replace payload. Not a
    ModelSerializer — `item` is a plain id whose target model depends on
    `input_type`, resolved by the view after validation.
    """

    id = serializers.IntegerField(required=False, allow_null=True)
    input_type = serializers.ChoiceField(choices=ProcessInputDefinition.InputType.choices)
    item = serializers.IntegerField()
    uom = serializers.CharField(max_length=20)
    quantity_capture = serializers.ChoiceField(
        choices=ProcessInputDefinition.QuantityCapture.choices,
        default=ProcessInputDefinition.QuantityCapture.MANUAL,
    )
    is_required = serializers.BooleanField(default=True)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        item_id = attrs["item"]
        if attrs["input_type"] == ProcessInputDefinition.InputType.WIP:
            if not Item.objects.filter(id=item_id, item_class=Item.ItemClass.WIP).exists():
                raise serializers.ValidationError({"item": "Select a WIP item."})
        else:
            if (
                not Item.objects.filter(id=item_id)
                .exclude(item_class__in=[Item.ItemClass.WIP, Item.ItemClass.FINISHED_GOOD])
                .exists()
            ):
                raise serializers.ValidationError({"item": "Select a material."})
        return attrs


class OutputClassificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = OutputClassification
        fields = ["id", "name", "is_active"]

    def create(self, validated_data: dict[str, Any]) -> OutputClassification:
        return OutputClassification.objects.create(
            organization=Organization.get_default(), **validated_data
        )


class ProcessOutputDefinitionSerializer(serializers.ModelSerializer):
    """Read-only representation nested inside a version. Writes go through
    `ProcessOutputWriteSerializer` + `ProcessDefinitionVersionViewSet.outputs`
    (a whole-list-replace action), not this serializer directly.
    """

    item_id = serializers.SerializerMethodField()
    item_label = serializers.SerializerMethodField()
    classification_name = serializers.CharField(source="classification.name", read_only=True)

    class Meta:
        model = ProcessOutputDefinition
        fields = [
            "id",
            "sequence",
            "item_type",
            "item_id",
            "item_label",
            "uom",
            "classification",
            "classification_name",
            "can_move_forward",
            "creates_traceable_output",
            "default_storage_destination",
        ]

    def get_item_id(self, obj: ProcessOutputDefinition) -> int | None:
        return obj.item_id

    def get_item_label(self, obj: ProcessOutputDefinition) -> str:
        item = obj.item
        if item is None:
            return ""
        return f"{item.name} ({item.code})"


class ProcessOutputWriteSerializer(serializers.Serializer):
    """Validates one row of the `outputs` whole-list-replace payload. Not a
    ModelSerializer — `item` is a plain id whose target model depends on
    `item_type`, resolved by the view after validation.
    """

    id = serializers.IntegerField(required=False, allow_null=True)
    item_type = serializers.ChoiceField(choices=ProcessOutputDefinition.ItemType.choices)
    item = serializers.IntegerField()
    uom = serializers.CharField(max_length=20)
    classification = serializers.IntegerField()
    can_move_forward = serializers.BooleanField(default=True)
    creates_traceable_output = serializers.BooleanField(default=True)
    default_storage_destination = serializers.CharField(
        max_length=100, required=False, allow_blank=True, default=""
    )

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        item_id = attrs["item"]
        if attrs["item_type"] == ProcessOutputDefinition.ItemType.PRODUCT:
            if not Item.objects.filter(
                id=item_id, item_class__in=[Item.ItemClass.WIP, Item.ItemClass.FINISHED_GOOD]
            ).exists():
                raise serializers.ValidationError({"item": "Select a product."})
        else:
            if (
                not Item.objects.filter(id=item_id)
                .exclude(item_class__in=[Item.ItemClass.WIP, Item.ItemClass.FINISHED_GOOD])
                .exists()
            ):
                raise serializers.ValidationError({"item": "Select a material."})
        if not OutputClassification.objects.filter(id=attrs["classification"]).exists():
            raise serializers.ValidationError({"classification": "Select a classification."})
        return attrs


class ProcessParameterDefinitionSerializer(serializers.ModelSerializer):
    """Read-only representation nested inside a version. Writes go through
    `ProcessParameterWriteSerializer` +
    `ProcessDefinitionVersionViewSet.parameters` (a whole-list-replace
    action), not this serializer directly.
    """

    class Meta:
        model = ProcessParameterDefinition
        fields = [
            "id",
            "sequence",
            "label",
            "code",
            "data_type",
            "unit",
            "capture_at",
            "is_required",
            "default_value",
        ]


class ProcessParameterWriteSerializer(serializers.Serializer):
    """Validates one row of the `parameters` whole-list-replace payload.
    `code` is required from the client — the frontend auto-generates it
    from `label` (same slugify-until-touched pattern as
    `ProcessDefinition.code`); this layer only enforces presence and
    per-version uniqueness (checked in the view, since it needs the
    version to scope the query).
    """

    id = serializers.IntegerField(required=False, allow_null=True)
    label = serializers.CharField(max_length=255)  # type: ignore[assignment]
    code = serializers.CharField(max_length=64)
    data_type = serializers.ChoiceField(choices=ProcessParameterDefinition.DataType.choices)
    unit = serializers.CharField(max_length=20, required=False, allow_blank=True, default="")
    capture_at = serializers.ChoiceField(choices=ProcessParameterDefinition.CaptureAt.choices)
    is_required = serializers.BooleanField(default=True)
    default_value = serializers.CharField(required=False, allow_blank=True, default="")


class ProcessDefinitionVersionSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True)
    inputs = ProcessInputDefinitionSerializer(many=True, read_only=True)
    inputs_count = serializers.SerializerMethodField()
    outputs = ProcessOutputDefinitionSerializer(many=True, read_only=True)
    outputs_count = serializers.SerializerMethodField()
    parameters = ProcessParameterDefinitionSerializer(many=True, read_only=True)
    parameters_count = serializers.SerializerMethodField()

    class Meta:
        model = ProcessDefinitionVersion
        fields = [
            "id",
            "version_number",
            "status",
            "category",
            "category_name",
            "work_centre_requirement",
            "operator_required",
            "standard_rate_config_level",
            "capture_mode",
            "position_label",
            "default_position_count",
            "allow_work_centre_override",
            "allow_different_sku_per_position",
            "allow_manual_standard_rate",
            "reserve_machine_derived_rate",
            "batch_lot_mode",
            "transaction_frequency",
            "partial_output_forward",
            "allow_over_production",
            "over_production_tolerance_percent",
            "input_consumption_mode",
            "completion_mode",
            "qc_requirement",
            "allow_correction_with_audit_trail",
            "allow_destructive_delete",
            "permit_machine_generated_source",
            "description",
            "inputs",
            "inputs_count",
            "outputs",
            "outputs_count",
            "parameters",
            "parameters_count",
        ]

    def get_inputs_count(self, obj: ProcessDefinitionVersion) -> int:
        return obj.inputs.count()

    def get_outputs_count(self, obj: ProcessDefinitionVersion) -> int:
        return obj.outputs.count()

    def get_parameters_count(self, obj: ProcessDefinitionVersion) -> int:
        return obj.parameters.count()

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        capture_mode = attrs.get("capture_mode", getattr(self.instance, "capture_mode", ""))
        if capture_mode in (
            ProcessDefinitionVersion.CaptureMode.POSITION_LEVEL,
            ProcessDefinitionVersion.CaptureMode.BOTH,
        ):
            position_label = attrs.get(
                "position_label", getattr(self.instance, "position_label", "")
            )
            default_position_count = attrs.get(
                "default_position_count",
                getattr(self.instance, "default_position_count", None),
            )
            if not position_label:
                raise serializers.ValidationError(
                    {"position_label": "Required when capture mode uses positions."}
                )
            if not default_position_count or default_position_count < 1:
                raise serializers.ValidationError(
                    {"default_position_count": "Must be at least 1 when using positions."}
                )

        allow_over_production = attrs.get(
            "allow_over_production", getattr(self.instance, "allow_over_production", True)
        )
        if allow_over_production:
            tolerance = attrs.get(
                "over_production_tolerance_percent",
                getattr(self.instance, "over_production_tolerance_percent", None),
            )
            if tolerance is None:
                raise serializers.ValidationError(
                    {"over_production_tolerance_percent": "Required when over-production is on."}
                )
        return attrs


class ProcessDefinitionSerializer(serializers.ModelSerializer):
    """Basics-shaped read/write on top of `ProcessDefinition` + its current
    version. `category`/`description` are write-only here — they don't
    belong to `ProcessDefinition` itself, they route through to the
    current version (see `create`/`update`); reading them back happens via
    the nested `current_version`.
    """

    category = serializers.PrimaryKeyRelatedField(
        queryset=ProcessCategory.objects.all(), write_only=True, required=True
    )
    description = serializers.CharField(write_only=True, required=False, allow_blank=True)
    current_version = serializers.SerializerMethodField()

    class Meta:
        model = ProcessDefinition
        fields = ["id", "name", "code", "is_active", "category", "description", "current_version"]

    def get_current_version(self, obj: ProcessDefinition) -> dict[str, Any] | None:
        version = obj.current_version()
        if version is None:
            return None
        return ProcessDefinitionVersionSerializer(version).data

    def create(self, validated_data: dict[str, Any]) -> ProcessDefinition:
        category = validated_data.pop("category")
        description = validated_data.pop("description", "")
        organization = Organization.get_default()
        definition = ProcessDefinition.objects.create(organization=organization, **validated_data)
        ProcessDefinitionVersion.objects.create(
            process_definition=definition,
            version_number=1,
            category=category,
            description=description,
            organization=organization,
        )
        return definition

    def update(
        self, instance: ProcessDefinition, validated_data: dict[str, Any]
    ) -> ProcessDefinition:
        category = validated_data.pop("category", None)
        description = validated_data.pop("description", None)
        instance = super().update(instance, validated_data)

        if category is not None or description is not None:
            version = instance.current_version()
            if version is None or version.status != ProcessDefinitionVersion.Status.DRAFT:
                raise serializers.ValidationError({"detail": "Only a draft version can be edited."})
            if category is not None:
                version.category = category
            if description is not None:
                version.description = description
            version.save()

        return instance


class ProcessExecutionInputSerializer(serializers.Serializer):
    """One row of the `inputs` list on a `ProcessExecution` create/update
    payload. Quantity is whatever the caller supplies — for Packing's
    Sorting/Cleaning/Packing execution, the caller (`apps.packing`)
    computes this from Material Issue records rather than letting the
    operator type it; this serializer itself stays generic and just
    persists whatever it's given, since a future non-Packing caller may
    have its own authoritative source instead.
    """

    id = serializers.IntegerField(required=False, allow_null=True)
    input_definition = serializers.PrimaryKeyRelatedField(
        queryset=ProcessInputDefinition.objects.all()
    )
    quantity = serializers.IntegerField(min_value=0)


class ProcessExecutionOutputSerializer(serializers.Serializer):
    """One row of the `outputs` list — entered directly by the operator
    (e.g. Accepted / Second Quality / Rejected counts)."""

    id = serializers.IntegerField(required=False, allow_null=True)
    output_definition = serializers.PrimaryKeyRelatedField(
        queryset=ProcessOutputDefinition.objects.all()
    )
    position_entry = serializers.IntegerField(required=False, allow_null=True, default=None)
    quantity = serializers.IntegerField(min_value=0)


class ProcessExecutionReadOutputSerializer(serializers.ModelSerializer):
    item_label = serializers.SerializerMethodField()
    classification_name = serializers.CharField(
        source="output_definition.classification.name", read_only=True
    )

    class Meta:
        model = ProcessExecutionOutput
        fields = ["id", "output_definition", "item_label", "classification_name", "quantity"]

    def get_item_label(self, obj: ProcessExecutionOutput) -> str:
        item = obj.output_definition.item
        return f"{item.name} ({item.code})" if item else ""


class ProcessExecutionReadInputSerializer(serializers.ModelSerializer):
    item_label = serializers.SerializerMethodField()

    class Meta:
        model = ProcessExecutionInput
        fields = ["id", "input_definition", "item_label", "quantity"]

    def get_item_label(self, obj: ProcessExecutionInput) -> str:
        item = obj.input_definition.item
        return f"{item.name} ({item.code})" if item else ""


class ProcessExecutionSerializer(serializers.ModelSerializer):
    """Creates/updates a `ProcessExecution` plus its nested `inputs` and
    `outputs` in one request, transactionally — the same "one nested
    payload, written atomically" shape as `ProcessDefinitionVersion`'s
    whole-list-replace actions, just for a create/update instead of a
    replace. `employees` accepts a plain list of Employee ids.
    """

    process_definition_name = serializers.CharField(
        source="process_version.process_definition.name", read_only=True
    )
    work_centre_name = serializers.CharField(source="work_centre.name", read_only=True, default=None)
    employees = serializers.PrimaryKeyRelatedField(
        queryset=Employee.objects.all(), many=True, required=False
    )
    employee_names = serializers.SerializerMethodField()
    inputs = ProcessExecutionReadInputSerializer(many=True, read_only=True)
    outputs = ProcessExecutionReadOutputSerializer(many=True, read_only=True)
    inputs_write = ProcessExecutionInputSerializer(many=True, write_only=True, required=False)
    outputs_write = ProcessExecutionOutputSerializer(many=True, write_only=True, required=False)
    total_input_quantity = serializers.IntegerField(read_only=True)
    total_output_quantity = serializers.IntegerField(read_only=True)

    class Meta:
        model = ProcessExecution
        fields = [
            "id",
            "process_version",
            "process_definition_name",
            "work_centre",
            "work_centre_name",
            "export_order_line",
            "date",
            "batch_lot_number",
            "employees",
            "employee_names",
            "remarks",
            "inputs",
            "outputs",
            "inputs_write",
            "outputs_write",
            "total_input_quantity",
            "total_output_quantity",
            "created_at",
        ]

    def get_employee_names(self, obj: ProcessExecution) -> list[str]:
        return [e.full_name for e in obj.employees.all()]

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        process_version = attrs.get(
            "process_version", getattr(self.instance, "process_version", None)
        )
        if process_version is None:
            return attrs

        work_centre = attrs.get("work_centre", getattr(self.instance, "work_centre", None))
        if (
            process_version.work_centre_requirement
            != ProcessDefinitionVersion.WorkCentreRequirement.NONE
            and work_centre is None
        ):
            raise serializers.ValidationError({"work_centre": "This process requires a work centre."})

        batch_lot_number = attrs.get(
            "batch_lot_number", getattr(self.instance, "batch_lot_number", "")
        )
        if (
            process_version.batch_lot_mode == ProcessDefinitionVersion.BatchLotMode.REQUIRED
            and not batch_lot_number
        ):
            raise serializers.ValidationError(
                {"batch_lot_number": "This process requires a batch/lot number."}
            )

        for row in attrs.get("outputs_write", []):
            if row["output_definition"].process_version_id != process_version.id:
                raise serializers.ValidationError(
                    {"outputs_write": "Output does not belong to this process version."}
                )
        for row in attrs.get("inputs_write", []):
            if row["input_definition"].process_version_id != process_version.id:
                raise serializers.ValidationError(
                    {"inputs_write": "Input does not belong to this process version."}
                )
        return attrs

    def create(self, validated_data: dict[str, Any]) -> ProcessExecution:
        inputs = validated_data.pop("inputs_write", [])
        outputs = validated_data.pop("outputs_write", [])
        employees = validated_data.pop("employees", [])
        organization = Organization.get_default()

        with transaction.atomic():
            execution = ProcessExecution.objects.create(organization=organization, **validated_data)
            execution.employees.set(employees)
            for row in inputs:
                ProcessExecutionInput.objects.create(
                    execution=execution,
                    input_definition=row["input_definition"],
                    quantity=row["quantity"],
                    organization=organization,
                )
            for row in outputs:
                ProcessExecutionOutput.objects.create(
                    execution=execution,
                    output_definition=row["output_definition"],
                    quantity=row["quantity"],
                    organization=organization,
                )
        return execution

    def update(
        self, instance: ProcessExecution, validated_data: dict[str, Any]
    ) -> ProcessExecution:
        inputs = validated_data.pop("inputs_write", None)
        outputs = validated_data.pop("outputs_write", None)
        employees = validated_data.pop("employees", None)

        with transaction.atomic():
            instance = super().update(instance, validated_data)
            if employees is not None:
                instance.employees.set(employees)
            if outputs is not None:
                instance.outputs.all().delete()
                for row in outputs:
                    ProcessExecutionOutput.objects.create(
                        execution=instance,
                        output_definition=row["output_definition"],
                        quantity=row["quantity"],
                        organization=instance.organization,
                    )
            if inputs is not None:
                instance.inputs.all().delete()
                for row in inputs:
                    ProcessExecutionInput.objects.create(
                        execution=instance,
                        input_definition=row["input_definition"],
                        quantity=row["quantity"],
                        organization=instance.organization,
                    )
        return instance
