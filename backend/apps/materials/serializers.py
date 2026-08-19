from typing import Any

from rest_framework import serializers

from apps.core.models import Organization

from .models import Material


class MaterialSerializer(serializers.ModelSerializer):
    class Meta:
        model = Material
        fields = ["id", "code", "name", "unit", "is_active"]

    def create(self, validated_data: dict[str, Any]) -> Material:
        return Material.objects.create(organization=Organization.get_default(), **validated_data)
