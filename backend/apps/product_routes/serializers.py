import re
from typing import Any

from rest_framework import serializers

from apps.core.models import Organization
from apps.processes.models import ProcessDefinition, ProcessOutputDefinition
from apps.products.models import Product

from .models import (
    ProcessRoute,
    ProcessRouteEdge,
    ProcessRouteNode,
    ProcessRouteVersion,
    StorageLocation,
)


class StorageLocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = StorageLocation
        fields = ["id", "name", "is_active"]

    def create(self, validated_data: dict[str, Any]) -> StorageLocation:
        return StorageLocation.objects.create(
            organization=Organization.get_default(), **validated_data
        )


def _slugify_node_key(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug or "step"


class ProcessRouteNodeOutputSerializer(serializers.ModelSerializer):
    """The resolved process version's output rows, exposed read-only on a
    node so the Output Routing step knows what dispositions it needs
    without a second round-trip.
    """

    item_label = serializers.SerializerMethodField()

    class Meta:
        model = ProcessOutputDefinition
        fields = ["id", "item_label", "classification", "classification_name"]

    classification_name = serializers.CharField(source="classification.name", read_only=True)

    def get_item_label(self, obj: ProcessOutputDefinition) -> str:
        is_product = obj.item_type == ProcessOutputDefinition.ItemType.PRODUCT
        item = obj.product if is_product else obj.material
        if item is None:
            return ""
        code = getattr(item, "sku_code", None) or getattr(item, "code", "")
        return f"{item.name} ({code})"


class ProcessRouteNodeSerializer(serializers.ModelSerializer):
    """Read-only representation nested inside a version. Writes go through
    `ProcessRouteNodeWriteSerializer` +
    `ProcessRouteVersionViewSet.nodes` (a whole-list-replace action).
    """

    process_definition_name = serializers.CharField(
        source="process_definition.name", read_only=True
    )
    outputs = serializers.SerializerMethodField()

    class Meta:
        model = ProcessRouteNode
        fields = [
            "id",
            "node_key",
            "process_definition",
            "process_definition_name",
            "display_label",
            "sequence_hint",
            "is_optional",
            "outputs",
        ]

    def get_outputs(self, obj: ProcessRouteNode) -> list[dict[str, Any]]:
        version = obj.process_definition_version or obj.process_definition.current_version()
        if version is None:
            return []
        return list(ProcessRouteNodeOutputSerializer(version.outputs.all(), many=True).data)


class ProcessRouteNodeWriteSerializer(serializers.Serializer):
    """Validates one row of the `nodes` whole-list-replace payload.
    `node_key` is optional — auto-generated from the process name (plus a
    numeric suffix on collision) when omitted, since the wireframe's Add
    Step modal doesn't expose a "node key" field to the user at all.
    """

    id = serializers.IntegerField(required=False, allow_null=True)
    node_key = serializers.CharField(max_length=64, required=False, allow_blank=True)
    process_definition = serializers.PrimaryKeyRelatedField(
        queryset=ProcessDefinition.objects.all()
    )
    display_label = serializers.CharField(
        max_length=255, required=False, allow_blank=True, default=""
    )
    is_optional = serializers.BooleanField(default=False)


class ProcessRouteEdgeSerializer(serializers.ModelSerializer):
    """Read-only representation nested inside a version. Writes go through
    `ProcessRouteEdgeWriteSerializer` +
    `ProcessRouteVersionViewSet.edges` (a whole-list-replace action).
    """

    destination_location_name = serializers.CharField(
        source="destination_location.name", read_only=True, default=""
    )

    class Meta:
        model = ProcessRouteEdge
        fields = [
            "id",
            "source_node",
            "source_output_definition",
            "target_node",
            "disposition_type",
            "destination_location",
            "destination_location_name",
        ]


class ProcessRouteEdgeWriteSerializer(serializers.Serializer):
    """Validates one row of the `edges` whole-list-replace payload.
    `source_node`/`target_node` reference real row ids — edges are always
    saved after nodes in the wizard flow, so by the time edges are written
    every node already has a persisted id.
    """

    id = serializers.IntegerField(required=False, allow_null=True)
    source_node = serializers.PrimaryKeyRelatedField(queryset=ProcessRouteNode.objects.all())
    source_output_definition = serializers.PrimaryKeyRelatedField(
        queryset=ProcessOutputDefinition.objects.all(),
        required=False,
        allow_null=True,
        default=None,
    )
    target_node = serializers.PrimaryKeyRelatedField(
        queryset=ProcessRouteNode.objects.all(), required=False, allow_null=True, default=None
    )
    disposition_type = serializers.ChoiceField(choices=ProcessRouteEdge.Disposition.choices)
    destination_location = serializers.PrimaryKeyRelatedField(
        queryset=StorageLocation.objects.all(), required=False, allow_null=True, default=None
    )

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        if attrs["disposition_type"] == ProcessRouteEdge.Disposition.CONTINUE_TO_PROCESS:
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


class ProcessRouteVersionSerializer(serializers.ModelSerializer):
    nodes = ProcessRouteNodeSerializer(many=True, read_only=True)
    edges = ProcessRouteEdgeSerializer(many=True, read_only=True)
    product = serializers.IntegerField(source="process_route.product_id", read_only=True)
    product_name = serializers.CharField(source="process_route.product.name", read_only=True)
    route_name = serializers.CharField(source="process_route.name", read_only=True)

    class Meta:
        model = ProcessRouteVersion
        fields = [
            "id",
            "version_number",
            "status",
            "is_default",
            "effective_from",
            "effective_to",
            "product",
            "product_name",
            "route_name",
            "nodes",
            "edges",
        ]


class ProcessRouteSerializer(serializers.ModelSerializer):
    """Basics-shaped read/write on top of `ProcessRoute` + its current
    version. `product`/`is_default`/`effective_from` are write-only here —
    they route through to the current version (see `create`/`update`);
    reading them back happens via the nested `current_version`.
    """

    product = serializers.PrimaryKeyRelatedField(
        queryset=Product.objects.all(), write_only=True, required=True
    )
    is_default = serializers.BooleanField(write_only=True, required=False, default=False)
    effective_from = serializers.DateField(write_only=True, required=False, allow_null=True)
    current_version = serializers.SerializerMethodField()

    class Meta:
        model = ProcessRoute
        fields = [
            "id",
            "name",
            "is_active",
            "product",
            "is_default",
            "effective_from",
            "current_version",
        ]

    def get_current_version(self, obj: ProcessRoute) -> dict[str, Any] | None:
        version = obj.current_version()
        if version is None:
            return None
        return ProcessRouteVersionSerializer(version).data

    def create(self, validated_data: dict[str, Any]) -> ProcessRoute:
        is_default = validated_data.pop("is_default", False)
        effective_from = validated_data.pop("effective_from", None)
        organization = Organization.get_default()
        route = ProcessRoute.objects.create(organization=organization, **validated_data)
        ProcessRouteVersion.objects.create(
            process_route=route,
            version_number=1,
            is_default=is_default,
            effective_from=effective_from,
            organization=organization,
        )
        return route

    def update(self, instance: ProcessRoute, validated_data: dict[str, Any]) -> ProcessRoute:
        validated_data.pop("product", None)
        validated_data.pop("is_default", None)
        validated_data.pop("effective_from", None)
        return super().update(instance, validated_data)
