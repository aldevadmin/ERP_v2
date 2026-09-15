import re
from typing import Any

from rest_framework import serializers

from apps.core.models import Organization
from apps.items.models import Item, ItemGroup
from apps.processes_v1.models import (
    ProcessDefinitionV1,
    ProcessInputDefinitionV1,
    ProcessOutputDefinitionV1,
)
from apps.product_routes.models import StorageLocation

from .models import (
    ProcessRouteEdgeV1,
    ProcessRouteItemMappingV1,
    ProcessRouteNodeV1,
    ProcessRouteV1,
    ProcessRouteVersionV1,
)


def _slugify_node_key(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug or "step"


class ProcessRouteNodeOutputSerializer(serializers.ModelSerializer):
    """The resolved process version's output rows, exposed read-only on a
    node so the Output Routing step knows what dispositions it needs
    without a second round-trip.
    """

    item_group_name = serializers.CharField(source="item_group.name", read_only=True)
    classification_name = serializers.CharField(
        source="classification.name", read_only=True, default=""
    )

    class Meta:
        model = ProcessOutputDefinitionV1
        fields = ["id", "item_group", "item_group_name", "classification", "classification_name"]


class ProcessRouteNodeInputSerializer(serializers.ModelSerializer):
    """Same idea as `ProcessRouteNodeOutputSerializer`, for a node's input
    rows — read by the Item Mappings screen.
    """

    item_group_name = serializers.CharField(source="item_group.name", read_only=True)

    class Meta:
        model = ProcessInputDefinitionV1
        fields = ["id", "item_group", "item_group_name"]


class ProcessRouteNodeSerializer(serializers.ModelSerializer):
    """Read-only representation nested inside a version. Writes go through
    `ProcessRouteNodeV1WriteSerializer` +
    `ProcessRouteVersionV1ViewSet.nodes` (a whole-list-replace action).
    """

    process_definition_name = serializers.CharField(
        source="process_definition.name", read_only=True
    )
    outputs = serializers.SerializerMethodField()
    inputs = serializers.SerializerMethodField()

    class Meta:
        model = ProcessRouteNodeV1
        fields = [
            "id",
            "node_key",
            "process_definition",
            "process_definition_name",
            "display_label",
            "sequence_hint",
            "is_optional",
            "outputs",
            "inputs",
        ]

    def get_outputs(self, obj: ProcessRouteNodeV1) -> list[dict[str, Any]]:
        version = obj.process_definition_version or obj.process_definition.current_version()
        if version is None:
            return []
        return list(ProcessRouteNodeOutputSerializer(version.outputs.all(), many=True).data)

    def get_inputs(self, obj: ProcessRouteNodeV1) -> list[dict[str, Any]]:
        version = obj.process_definition_version or obj.process_definition.current_version()
        if version is None:
            return []
        return list(ProcessRouteNodeInputSerializer(version.inputs.all(), many=True).data)


class ProcessRouteNodeV1WriteSerializer(serializers.Serializer):
    """Validates one row of the `nodes` whole-list-replace payload.
    `node_key` is optional — auto-generated from the process name (plus a
    numeric suffix on collision) when omitted.
    """

    id = serializers.IntegerField(required=False, allow_null=True)
    node_key = serializers.CharField(max_length=64, required=False, allow_blank=True)
    process_definition = serializers.PrimaryKeyRelatedField(
        queryset=ProcessDefinitionV1.objects.all()
    )
    display_label = serializers.CharField(
        max_length=255, required=False, allow_blank=True, default=""
    )
    is_optional = serializers.BooleanField(default=False)


class ProcessRouteEdgeSerializer(serializers.ModelSerializer):
    """Read-only representation nested inside a version. Writes go through
    `ProcessRouteEdgeV1WriteSerializer` +
    `ProcessRouteVersionV1ViewSet.edges` (a whole-list-replace action).
    """

    destination_location_name = serializers.CharField(
        source="destination_location.name", read_only=True, default=""
    )

    class Meta:
        model = ProcessRouteEdgeV1
        fields = [
            "id",
            "source_node",
            "source_output_definition",
            "target_node",
            "disposition_type",
            "destination_location",
            "destination_location_name",
        ]


class ProcessRouteEdgeV1WriteSerializer(serializers.Serializer):
    """Validates one row of the `edges` whole-list-replace payload."""

    id = serializers.IntegerField(required=False, allow_null=True)
    source_node = serializers.PrimaryKeyRelatedField(queryset=ProcessRouteNodeV1.objects.all())
    source_output_definition = serializers.PrimaryKeyRelatedField(
        queryset=ProcessOutputDefinitionV1.objects.all(),
        required=False,
        allow_null=True,
        default=None,
    )
    target_node = serializers.PrimaryKeyRelatedField(
        queryset=ProcessRouteNodeV1.objects.all(), required=False, allow_null=True, default=None
    )
    disposition_type = serializers.ChoiceField(choices=ProcessRouteEdgeV1.Disposition.choices)
    destination_location = serializers.PrimaryKeyRelatedField(
        queryset=StorageLocation.objects.all(), required=False, allow_null=True, default=None
    )

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        if attrs["disposition_type"] == ProcessRouteEdgeV1.Disposition.CONTINUE_TO_PROCESS:
            if not attrs.get("target_node"):
                raise serializers.ValidationError(
                    {"target_node": "Required when continuing to another process."}
                )
        else:
            if not attrs.get("destination_location"):
                raise serializers.ValidationError(
                    {"destination_location": "Required when moving to storage."}
                )
        return attrs


class ProcessRouteItemMappingV1Serializer(serializers.ModelSerializer):
    """Read-only representation nested inside a version. Writes go through
    `ProcessRouteItemMappingV1WriteSerializer` +
    `ProcessRouteVersionV1ViewSet.item_mappings` (a whole-list-replace
    action).
    """

    target_item_name = serializers.CharField(source="target_item.name", read_only=True)
    resolved_item_name = serializers.CharField(source="resolved_item.name", read_only=True)

    class Meta:
        model = ProcessRouteItemMappingV1
        fields = [
            "id",
            "node",
            "input_definition",
            "output_definition",
            "target_item",
            "target_item_name",
            "resolved_item",
            "resolved_item_name",
        ]


class ProcessRouteItemMappingV1WriteSerializer(serializers.Serializer):
    """Validates one row of the `item_mappings` whole-list-replace payload.
    Row-local checks only — checks that need the parent version/route
    (definition belongs to this node's version, target_item belongs to the
    route's own item_group) live in
    `ProcessRouteVersionV1ViewSet.item_mappings`, mirroring the existing
    `edges` action's split.
    """

    id = serializers.IntegerField(required=False, allow_null=True)
    node = serializers.PrimaryKeyRelatedField(queryset=ProcessRouteNodeV1.objects.all())
    input_definition = serializers.IntegerField(required=False, allow_null=True, default=None)
    output_definition = serializers.IntegerField(required=False, allow_null=True, default=None)
    target_item = serializers.PrimaryKeyRelatedField(queryset=Item.objects.all())
    resolved_item = serializers.PrimaryKeyRelatedField(queryset=Item.objects.all())

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        input_id = attrs.get("input_definition")
        output_id = attrs.get("output_definition")
        if bool(input_id) == bool(output_id):
            raise serializers.ValidationError(
                {"detail": "Exactly one of input_definition/output_definition is required."}
            )

        resolved_item = attrs["resolved_item"]
        if input_id:
            try:
                definition: Any = ProcessInputDefinitionV1.objects.get(id=int(input_id))
            except ProcessInputDefinitionV1.DoesNotExist:
                raise serializers.ValidationError(
                    {"input_definition": "This input does not exist."}
                ) from None
            attrs["input_definition"] = definition
        else:
            assert output_id is not None  # guaranteed by the exclusivity check above
            try:
                definition = ProcessOutputDefinitionV1.objects.get(id=int(output_id))
            except ProcessOutputDefinitionV1.DoesNotExist:
                raise serializers.ValidationError(
                    {"output_definition": "This output does not exist."}
                ) from None
            attrs["output_definition"] = definition

        if resolved_item.item_group_id != definition.item_group_id:
            raise serializers.ValidationError(
                {"resolved_item": "This item does not belong to the slot's Item Group."}
            )
        classification_id = getattr(definition, "classification_id", None)
        if classification_id is not None and resolved_item.classification_id != classification_id:
            raise serializers.ValidationError(
                {"resolved_item": "This item's grade does not match the slot's classification."}
            )
        return attrs


class ProcessRouteVersionV1Serializer(serializers.ModelSerializer):
    nodes = ProcessRouteNodeSerializer(many=True, read_only=True)
    edges = ProcessRouteEdgeSerializer(many=True, read_only=True)
    item_mappings = ProcessRouteItemMappingV1Serializer(many=True, read_only=True)
    item_group = serializers.IntegerField(source="process_route.item_group_id", read_only=True)
    item_group_name = serializers.CharField(
        source="process_route.item_group.name", read_only=True
    )
    route_name = serializers.CharField(source="process_route.name", read_only=True)

    class Meta:
        model = ProcessRouteVersionV1
        fields = [
            "id",
            "version_number",
            "status",
            "is_default",
            "effective_from",
            "effective_to",
            "item_group",
            "item_group_name",
            "route_name",
            "nodes",
            "edges",
            "item_mappings",
        ]


class ProcessRouteV1Serializer(serializers.ModelSerializer):
    """Basics-shaped read/write on top of `ProcessRouteV1` + its current
    version. `item_group`/`is_default`/`effective_from` are write-only
    here — they route through to the current version (see `create`).
    """

    item_group = serializers.PrimaryKeyRelatedField(
        queryset=ItemGroup.objects.all(), write_only=True, required=True
    )
    is_default = serializers.BooleanField(write_only=True, required=False, default=False)
    effective_from = serializers.DateField(write_only=True, required=False, allow_null=True)
    current_version = serializers.SerializerMethodField()

    class Meta:
        model = ProcessRouteV1
        fields = [
            "id",
            "name",
            "is_active",
            "item_group",
            "is_default",
            "effective_from",
            "current_version",
        ]

    def get_current_version(self, obj: ProcessRouteV1) -> dict[str, Any] | None:
        version = obj.current_version()
        if version is None:
            return None
        return ProcessRouteVersionV1Serializer(version).data

    def create(self, validated_data: dict[str, Any]) -> ProcessRouteV1:
        is_default = validated_data.pop("is_default", False)
        effective_from = validated_data.pop("effective_from", None)
        organization = Organization.get_default()
        route = ProcessRouteV1.objects.create(organization=organization, **validated_data)
        ProcessRouteVersionV1.objects.create(
            process_route=route,
            version_number=1,
            is_default=is_default,
            effective_from=effective_from,
            organization=organization,
        )
        return route

    def update(self, instance: ProcessRouteV1, validated_data: dict[str, Any]) -> ProcessRouteV1:
        validated_data.pop("item_group", None)
        validated_data.pop("is_default", None)
        validated_data.pop("effective_from", None)
        return super().update(instance, validated_data)
