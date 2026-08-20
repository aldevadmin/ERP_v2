from typing import Any

from rest_framework import serializers

from apps.core.models import Organization
from apps.processes.models import ProcessDefinition

from .models import WorkCentre, WorkCentreProcessCapability


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

    class Meta:
        model = WorkCentre
        fields = ["id", "name", "code", "type", "is_active", "capabilities", "capabilities_count"]

    def get_capabilities_count(self, obj: WorkCentre) -> int:
        return obj.capabilities.count()

    def create(self, validated_data: dict[str, Any]) -> WorkCentre:
        return WorkCentre.objects.create(organization=Organization.get_default(), **validated_data)
