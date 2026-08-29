from typing import Any

from rest_framework import serializers

from apps.core.models import Organization
from apps.items.models import Item
from apps.packaging.models import PackagingProfileVersion

from .models import (
    CustomerProductMapping,
    CustomerProductMappingVersion,
    MappingFile,
    MappingRequirement,
)

MAX_FILES_PER_CATEGORY = {
    MappingFile.Category.PLATE_IMAGE: 10,
    MappingFile.Category.POUCH_IMAGE: 10,
    MappingFile.Category.DESIGN_FILE: 10,
    MappingFile.Category.RETAIL_STICKER_IMAGE: 3,
}


class MappingFileSerializer(serializers.ModelSerializer):
    class Meta:
        model = MappingFile
        fields = ["id", "category", "file", "created_at"]

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        version: CustomerProductMappingVersion = self.context["mapping_version"]
        category = attrs["category"]
        cap = MAX_FILES_PER_CATEGORY[category]
        existing = MappingFile.objects.filter(version=version, category=category).count()
        if existing >= cap:
            raise serializers.ValidationError(
                {"file": f"Maximum of {cap} files reached for this category."}
            )
        return attrs

    def create(self, validated_data: dict[str, Any]) -> MappingFile:
        return MappingFile.objects.create(version=self.context["mapping_version"], **validated_data)


class MappingRequirementSerializer(serializers.ModelSerializer):
    class Meta:
        model = MappingRequirement
        fields = ["id", "category", "key", "value", "is_required", "sort_order"]


class MappingRequirementWriteSerializer(serializers.Serializer):
    """Validates one row of the `requirements` whole-list-replace payload —
    same shape as `processes.ProcessInputWriteSerializer`.
    """

    id = serializers.IntegerField(required=False, allow_null=True)
    category = serializers.ChoiceField(choices=MappingRequirement.Category.choices)
    key = serializers.CharField(max_length=100)
    value = serializers.CharField(max_length=500, required=False, allow_blank=True, default="")
    is_required = serializers.BooleanField(default=True)
    sort_order = serializers.IntegerField(default=0)


class CustomerProductMappingVersionSerializer(serializers.ModelSerializer):
    mapping_code = serializers.CharField(source="mapping.mapping_code", read_only=True)
    customer_name = serializers.CharField(source="mapping.customer.name", read_only=True)
    item_name = serializers.CharField(source="mapping.item.name", read_only=True)
    item_code = serializers.CharField(source="mapping.item.code", read_only=True)
    customer_sku = serializers.CharField(source="mapping.customer_sku", read_only=True)
    selling_uom_code = serializers.CharField(source="selling_uom.code", read_only=True)
    packaging_profile_name = serializers.CharField(
        source="packaging_profile_version.profile.name", read_only=True
    )
    packaging_profile_version_number = serializers.IntegerField(
        source="packaging_profile_version.version_number", read_only=True
    )
    requirements = MappingRequirementSerializer(many=True, read_only=True)
    files = MappingFileSerializer(many=True, read_only=True)

    class Meta:
        model = CustomerProductMappingVersion
        fields = [
            "id",
            "mapping",
            "mapping_code",
            "customer_name",
            "item_name",
            "item_code",
            "version_number",
            "status",
            "effective_from",
            "effective_to",
            "customer_sku",
            "customer_description",
            "packaging_profile_version",
            "packaging_profile_name",
            "packaging_profile_version_number",
            "selling_uom",
            "selling_uom_code",
            "unit_price",
            "currency",
            "barcode",
            "requirements",
            "files",
        ]

    def validate_packaging_profile_version(
        self, value: PackagingProfileVersion | None
    ) -> PackagingProfileVersion | None:
        if value is not None and value.status != PackagingProfileVersion.Status.PUBLISHED:
            raise serializers.ValidationError("Select a published packaging profile version.")
        return value


class CustomerProductMappingSerializer(serializers.ModelSerializer):
    item = serializers.PrimaryKeyRelatedField(
        queryset=Item.objects.filter(
            item_class__in=[Item.ItemClass.WIP, Item.ItemClass.FINISHED_GOOD]
        )
    )
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    item_name = serializers.CharField(source="item.name", read_only=True)
    item_code = serializers.CharField(source="item.code", read_only=True)
    mapping_code = serializers.CharField(read_only=True)
    current_version = serializers.SerializerMethodField()

    class Meta:
        model = CustomerProductMapping
        fields = [
            "id",
            "customer",
            "customer_name",
            "item",
            "item_name",
            "item_code",
            "customer_sku",
            "mapping_code",
            "is_active",
            "current_version",
        ]

    def get_current_version(self, obj: CustomerProductMapping) -> dict[str, Any] | None:
        version = obj.current_version()
        if version is None:
            return None
        return CustomerProductMappingVersionSerializer(version).data

    def create(self, validated_data: dict[str, Any]) -> CustomerProductMapping:
        organization = Organization.get_default()
        validated_data["mapping_code"] = (
            f"{validated_data['item'].code}-{validated_data['customer'].code}-"
            f"{validated_data['customer_sku']}"
        )
        mapping = CustomerProductMapping.objects.create(organization=organization, **validated_data)
        CustomerProductMappingVersion.objects.create(
            mapping=mapping, version_number=1, organization=organization
        )
        return mapping
