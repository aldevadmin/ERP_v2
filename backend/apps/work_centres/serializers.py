from typing import Any

from rest_framework import serializers

from apps.core.models import Organization
from apps.processes.models import ProcessDefinition
from apps.tooling.serializers import WorkCentrePositionSerializer

from .models import Bay, WorkCentre, WorkCentreProcessCapability, WorkCentreType


class WorkCentreTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkCentreType
        fields = ["id", "name", "is_active"]

    def create(self, validated_data: dict[str, Any]) -> WorkCentreType:
        return WorkCentreType.objects.create(
            organization=Organization.get_default(), **validated_data
        )


class BaySerializer(serializers.ModelSerializer):
    class Meta:
        model = Bay
        fields = ["id", "name", "code", "is_active"]

    def create(self, validated_data: dict[str, Any]) -> Bay:
        return Bay.objects.create(organization=Organization.get_default(), **validated_data)


class WorkCentreCapabilitySerializer(serializers.ModelSerializer):
    """Read-only representation nested inside a work centre. Writes go
    through `WorkCentreCapabilityWriteSerializer` +
    `WorkCentreViewSet.capabilities` (a whole-list-replace action), not
    this serializer directly — same pattern as
    `apps.processes.ProcessInputDefinitionSerializer`.
    """

    process_name = serializers.CharField(source="process_definition.name", read_only=True)
    process_code = serializers.CharField(source="process_definition.code", read_only=True)

    class Meta:
        model = WorkCentreProcessCapability
        fields = ["id", "process_definition", "process_name", "process_code", "standard_rate"]


class WorkCentreCapabilityWriteSerializer(serializers.Serializer):
    id = serializers.IntegerField(required=False, allow_null=True)
    process_definition = serializers.PrimaryKeyRelatedField(
        queryset=ProcessDefinition.objects.all()
    )
    standard_rate = serializers.DecimalField(
        max_digits=10, decimal_places=2, required=False, allow_null=True, default=None
    )


class WorkCentreSerializer(serializers.ModelSerializer):
    capabilities = WorkCentreCapabilitySerializer(many=True, read_only=True)
    capabilities_count = serializers.SerializerMethodField()
    positions = WorkCentrePositionSerializer(many=True, read_only=True)
    positions_count = serializers.SerializerMethodField()
    type_name = serializers.CharField(source="type.name", read_only=True)
    bay_name = serializers.CharField(source="bay.name", read_only=True, default=None)

    class Meta:
        model = WorkCentre
        fields = [
            "id",
            "name",
            "code",
            "type",
            "type_name",
            "bay",
            "bay_name",
            "is_active",
            "capabilities",
            "capabilities_count",
            "positions",
            "positions_count",
        ]

    def get_capabilities_count(self, obj: WorkCentre) -> int:
        return obj.capabilities.count()

    def get_positions_count(self, obj: WorkCentre) -> int:
        return obj.positions.count()

    def create(self, validated_data: dict[str, Any]) -> WorkCentre:
        return WorkCentre.objects.create(organization=Organization.get_default(), **validated_data)
