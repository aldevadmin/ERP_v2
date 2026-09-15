from typing import Any

from rest_framework import serializers

from apps.core.models import Organization
from apps.items.models import ItemGroup
from apps.processes.models import OutputClassification, ProcessCategory

from .models import (
    ProcessDefinitionV1,
    ProcessDefinitionVersionV1,
    ProcessInputDefinitionV1,
    ProcessOutputDefinitionV1,
)


class ProcessInputDefinitionV1Serializer(serializers.ModelSerializer):
    """Read-only representation nested inside a version. Writes go through
    `ProcessInputDefinitionV1WriteSerializer` +
    `ProcessDefinitionVersionV1ViewSet.inputs` (a whole-list-replace
    action), not this serializer directly.
    """

    item_group_name = serializers.CharField(source="item_group.name", read_only=True)

    class Meta:
        model = ProcessInputDefinitionV1
        fields = ["id", "sequence", "item_group", "item_group_name", "uom", "is_required"]


class ProcessInputDefinitionV1WriteSerializer(serializers.Serializer):
    """Validates one row of the `inputs` whole-list-replace payload."""

    id = serializers.IntegerField(required=False, allow_null=True)
    item_group = serializers.IntegerField()
    uom = serializers.CharField(max_length=20)
    is_required = serializers.BooleanField(default=True)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        if not ItemGroup.objects.filter(id=attrs["item_group"]).exists():
            raise serializers.ValidationError({"item_group": "Select an Item Group."})
        return attrs


class ProcessOutputDefinitionV1Serializer(serializers.ModelSerializer):
    """Read-only representation nested inside a version. Writes go through
    `ProcessOutputDefinitionV1WriteSerializer` +
    `ProcessDefinitionVersionV1ViewSet.outputs` (a whole-list-replace
    action), not this serializer directly.
    """

    item_group_name = serializers.CharField(source="item_group.name", read_only=True)
    classification_name = serializers.CharField(
        source="classification.name", read_only=True, default=""
    )

    class Meta:
        model = ProcessOutputDefinitionV1
        fields = [
            "id",
            "sequence",
            "item_group",
            "item_group_name",
            "classification",
            "classification_name",
            "uom",
            "can_move_forward",
            "creates_traceable_output",
        ]


class ProcessOutputDefinitionV1WriteSerializer(serializers.Serializer):
    """Validates one row of the `outputs` whole-list-replace payload.
    `classification` is optional — see `ProcessOutputDefinitionV1`'s
    docstring for why it's kept alongside, not replaced by, `item_group`.
    """

    id = serializers.IntegerField(required=False, allow_null=True)
    item_group = serializers.IntegerField()
    classification = serializers.IntegerField(required=False, allow_null=True, default=None)
    uom = serializers.CharField(max_length=20)
    can_move_forward = serializers.BooleanField(default=True)
    creates_traceable_output = serializers.BooleanField(default=True)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        if not ItemGroup.objects.filter(id=attrs["item_group"]).exists():
            raise serializers.ValidationError({"item_group": "Select an Item Group."})
        classification = attrs.get("classification")
        if classification is not None and not OutputClassification.objects.filter(
            id=classification
        ).exists():
            raise serializers.ValidationError({"classification": "Select a classification."})
        return attrs


class ProcessDefinitionVersionV1Serializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True)
    inputs = ProcessInputDefinitionV1Serializer(many=True, read_only=True)
    inputs_count = serializers.SerializerMethodField()
    outputs = ProcessOutputDefinitionV1Serializer(many=True, read_only=True)
    outputs_count = serializers.SerializerMethodField()

    class Meta:
        model = ProcessDefinitionVersionV1
        fields = [
            "id",
            "version_number",
            "status",
            "category",
            "category_name",
            "description",
            "inputs",
            "inputs_count",
            "outputs",
            "outputs_count",
        ]

    def get_inputs_count(self, obj: ProcessDefinitionVersionV1) -> int:
        return obj.inputs.count()

    def get_outputs_count(self, obj: ProcessDefinitionVersionV1) -> int:
        return obj.outputs.count()


class ProcessDefinitionV1Serializer(serializers.ModelSerializer):
    """Basics-shaped read/write on top of `ProcessDefinitionV1` + its
    current version — same "category/description write-through to version
    1 on create()" pattern as `apps.processes.ProcessDefinitionSerializer`.
    """

    category = serializers.PrimaryKeyRelatedField(
        queryset=ProcessCategory.objects.all(), write_only=True, required=True
    )
    description = serializers.CharField(write_only=True, required=False, allow_blank=True)
    current_version = serializers.SerializerMethodField()

    class Meta:
        model = ProcessDefinitionV1
        fields = ["id", "name", "code", "is_active", "category", "description", "current_version"]

    def get_current_version(self, obj: ProcessDefinitionV1) -> dict[str, Any] | None:
        version = obj.current_version()
        if version is None:
            return None
        return ProcessDefinitionVersionV1Serializer(version).data

    def create(self, validated_data: dict[str, Any]) -> ProcessDefinitionV1:
        category = validated_data.pop("category")
        description = validated_data.pop("description", "")
        organization = Organization.get_default()
        definition = ProcessDefinitionV1.objects.create(
            organization=organization, **validated_data
        )
        ProcessDefinitionVersionV1.objects.create(
            process_definition=definition,
            version_number=1,
            category=category,
            description=description,
            organization=organization,
        )
        return definition

    def update(
        self, instance: ProcessDefinitionV1, validated_data: dict[str, Any]
    ) -> ProcessDefinitionV1:
        category = validated_data.pop("category", None)
        description = validated_data.pop("description", None)
        instance = super().update(instance, validated_data)

        if category is not None or description is not None:
            version = instance.current_version()
            if version is None or version.status != ProcessDefinitionVersionV1.Status.DRAFT:
                raise serializers.ValidationError({"detail": "Only a draft version can be edited."})
            if category is not None:
                version.category = category
            if description is not None:
                version.description = description
            version.save()

        return instance
