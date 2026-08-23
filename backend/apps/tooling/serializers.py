from typing import Any

from rest_framework import serializers

from apps.core.models import Organization
from apps.items.models import Item
from apps.processes.models import ProcessDefinition

from .models import (
    Tooling,
    ToolingAssignment,
    ToolingCompatibility,
    ToolingType,
    WorkCentrePosition,
)


class ToolingTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ToolingType
        fields = ["id", "name", "is_active"]

    def create(self, validated_data: dict[str, Any]) -> ToolingType:
        return ToolingType.objects.create(organization=Organization.get_default(), **validated_data)


class ToolingCompatibilitySerializer(serializers.ModelSerializer):
    """Read-only representation nested inside a tooling record. Writes go
    through `ToolingCompatibilityWriteSerializer` +
    `ToolingViewSet.compatibilities` (a whole-list-replace action).
    """

    item_name = serializers.CharField(source="item.name", read_only=True)
    item_code = serializers.CharField(source="item.code", read_only=True)
    process_definition_name = serializers.CharField(
        source="process_definition.name", read_only=True, default=""
    )

    class Meta:
        model = ToolingCompatibility
        fields = [
            "id",
            "item",
            "item_name",
            "item_code",
            "process_definition",
            "process_definition_name",
        ]


class ToolingCompatibilityWriteSerializer(serializers.Serializer):
    id = serializers.IntegerField(required=False, allow_null=True)
    item = serializers.PrimaryKeyRelatedField(queryset=Item.objects.all())
    process_definition = serializers.PrimaryKeyRelatedField(
        queryset=ProcessDefinition.objects.all(), required=False, allow_null=True, default=None
    )


class ToolingSerializer(serializers.ModelSerializer):
    compatibilities = ToolingCompatibilitySerializer(many=True, read_only=True)
    compatibilities_count = serializers.SerializerMethodField()
    tooling_type_name = serializers.CharField(source="tooling_type.name", read_only=True)

    class Meta:
        model = Tooling
        fields = [
            "id",
            "code",
            "name",
            "tooling_type",
            "tooling_type_name",
            "cavity_count",
            "default_standard_rate",
            "is_active",
            "notes",
            "compatibilities",
            "compatibilities_count",
        ]

    def get_compatibilities_count(self, obj: Tooling) -> int:
        return obj.compatibilities.count()

    def create(self, validated_data: dict[str, Any]) -> Tooling:
        return Tooling.objects.create(organization=Organization.get_default(), **validated_data)


class WorkCentrePositionSerializer(serializers.ModelSerializer):
    """Read-only representation nested inside a work centre. Writes go
    through `WorkCentrePositionWriteSerializer` +
    `WorkCentreViewSet.positions` (a whole-list-replace action, in
    apps.work_centres).
    """

    installed_tooling = serializers.SerializerMethodField()
    installed_tooling_code = serializers.SerializerMethodField()
    default_sku = serializers.SerializerMethodField()
    standard_rate = serializers.SerializerMethodField()

    class Meta:
        model = WorkCentrePosition
        fields = [
            "id",
            "position_index",
            "display_label",
            "is_active",
            "installed_tooling",
            "installed_tooling_code",
            "default_sku",
            "standard_rate",
        ]

    def _current_assignment(self, obj: WorkCentrePosition) -> ToolingAssignment | None:
        return obj.assignments.filter(effective_to__isnull=True).order_by("-effective_from").first()

    def get_installed_tooling(self, obj: WorkCentrePosition) -> str:
        assignment = self._current_assignment(obj)
        return assignment.tooling.name if assignment else ""

    def get_installed_tooling_code(self, obj: WorkCentrePosition) -> str:
        assignment = self._current_assignment(obj)
        return assignment.tooling.code if assignment else ""

    def get_default_sku(self, obj: WorkCentrePosition) -> str:
        assignment = self._current_assignment(obj)
        if assignment and assignment.default_item:
            return f"{assignment.default_item.name} ({assignment.default_item.code})"
        return ""

    def get_standard_rate(self, obj: WorkCentrePosition) -> str:
        assignment = self._current_assignment(obj)
        if not assignment:
            return ""
        if assignment.standard_rate_override is not None:
            return str(assignment.standard_rate_override)
        if assignment.tooling.default_standard_rate is not None:
            return str(assignment.tooling.default_standard_rate)
        return ""


class WorkCentrePositionWriteSerializer(serializers.Serializer):
    id = serializers.IntegerField(required=False, allow_null=True)
    position_index = serializers.IntegerField(required=False, allow_null=True)
    display_label = serializers.CharField(
        max_length=255, required=False, allow_blank=True, default=""
    )
    is_active = serializers.BooleanField(default=True)


class ToolingAssignmentSerializer(serializers.ModelSerializer):
    tooling_name = serializers.CharField(source="tooling.name", read_only=True)
    tooling_code = serializers.CharField(source="tooling.code", read_only=True)
    work_centre_name = serializers.CharField(
        source="work_centre_position.work_centre.name", read_only=True
    )
    position_index = serializers.IntegerField(
        source="work_centre_position.position_index", read_only=True
    )
    default_item_label = serializers.SerializerMethodField()

    class Meta:
        model = ToolingAssignment
        fields = [
            "id",
            "tooling",
            "tooling_name",
            "tooling_code",
            "work_centre_position",
            "work_centre_name",
            "position_index",
            "default_item",
            "default_item_label",
            "standard_rate_override",
            "effective_from",
            "effective_to",
            "notes",
        ]

    def get_default_item_label(self, obj: ToolingAssignment) -> str:
        if not obj.default_item:
            return ""
        return f"{obj.default_item.name} ({obj.default_item.code})"


class ToolingAssignmentWriteSerializer(serializers.Serializer):
    """Validates the payload for creating a new assignment (which also
    performs the changeover — closing any currently open assignment on the
    same position — see `WorkCentrePositionViewSet.assignments`).
    """

    tooling = serializers.PrimaryKeyRelatedField(queryset=Tooling.objects.all())
    default_item = serializers.PrimaryKeyRelatedField(
        queryset=Item.objects.all(), required=False, allow_null=True, default=None
    )
    standard_rate_override = serializers.DecimalField(
        max_digits=10, decimal_places=2, required=False, allow_null=True, default=None
    )
    effective_from = serializers.DateTimeField()
    notes = serializers.CharField(required=False, allow_blank=True, default="")
