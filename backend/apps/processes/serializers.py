from typing import Any

from rest_framework import serializers

from apps.core.models import Organization
from apps.items.models import Item

from .models import (
    OutputClassification,
    ProcessCategory,
    ProcessDefinition,
    ProcessDefinitionVersion,
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
