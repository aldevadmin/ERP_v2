from typing import Any

from rest_framework import serializers

from apps.core.models import Organization
from apps.materials.models import Material

from .models import Process, ProcessCategory


class ProcessCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ProcessCategory
        fields = ["id", "name", "is_active"]

    def create(self, validated_data: dict[str, Any]) -> ProcessCategory:
        return ProcessCategory.objects.create(
            organization=Organization.get_default(), **validated_data
        )


class ProcessSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True)
    inputs = serializers.PrimaryKeyRelatedField(
        many=True, queryset=Material.objects.filter(is_active=True), required=False
    )
    outputs = serializers.PrimaryKeyRelatedField(
        many=True, queryset=Material.objects.filter(is_active=True), required=False
    )

    class Meta:
        model = Process
        fields = [
            "id",
            "name",
            "category",
            "category_name",
            "resource_type",
            "inputs",
            "outputs",
            "description",
            "is_active",
        ]

    def create(self, validated_data: dict[str, Any]) -> Process:
        inputs = validated_data.pop("inputs", [])
        outputs = validated_data.pop("outputs", [])
        process = Process.objects.create(organization=Organization.get_default(), **validated_data)
        process.inputs.set(inputs)
        process.outputs.set(outputs)
        return process
