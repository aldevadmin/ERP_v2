from typing import Any

from rest_framework import serializers

from apps.core.models import Organization
from apps.items.models import UOM, Item

from .models import PackagingProfile, PackagingProfileMaterial, PackagingProfileVersion


class PackagingProfileMaterialSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source="item.name", read_only=True)
    item_code = serializers.CharField(source="item.code", read_only=True)
    uom_code = serializers.CharField(source="uom.code", read_only=True)

    class Meta:
        model = PackagingProfileMaterial
        fields = ["id", "item", "item_name", "item_code", "level", "quantity", "uom", "uom_code"]


class PackagingProfileMaterialWriteSerializer(serializers.Serializer):
    """Validates one row of the `materials` whole-list-replace payload —
    same shape as `processes.ProcessInputWriteSerializer`.
    """

    id = serializers.IntegerField(required=False, allow_null=True)
    item = serializers.PrimaryKeyRelatedField(
        queryset=Item.objects.filter(item_class=Item.ItemClass.PACKAGING_MATERIAL)
    )
    level = serializers.ChoiceField(choices=PackagingProfileMaterial.Level.choices)
    quantity = serializers.DecimalField(max_digits=10, decimal_places=3)
    uom = serializers.PrimaryKeyRelatedField(queryset=UOM.objects.all())


class PackagingProfileVersionSerializer(serializers.ModelSerializer):
    profile_name = serializers.CharField(source="profile.name", read_only=True)
    selling_uom_code = serializers.CharField(source="selling_uom.code", read_only=True)
    materials = PackagingProfileMaterialSerializer(many=True, read_only=True)

    class Meta:
        model = PackagingProfileVersion
        fields = [
            "id",
            "profile",
            "profile_name",
            "version_number",
            "status",
            "effective_from",
            "effective_to",
            "selling_uom",
            "selling_uom_code",
            "pack_mode",
            "pieces_per_pouch",
            "pouches_per_carton",
            "carton_length_mm",
            "carton_breadth_mm",
            "carton_height_mm",
            "carton_net_weight_kg",
            "carton_gross_weight_kg",
            "pieces_per_selling_unit",
            "cbm",
            "materials",
        ]
        read_only_fields = ["pieces_per_selling_unit", "cbm"]


class PackagingProfileSerializer(serializers.ModelSerializer):
    finished_item = serializers.PrimaryKeyRelatedField(
        queryset=Item.objects.filter(
            item_class__in=[Item.ItemClass.WIP, Item.ItemClass.FINISHED_GOOD]
        )
    )
    finished_item_name = serializers.CharField(source="finished_item.name", read_only=True)
    current_version = serializers.SerializerMethodField()

    class Meta:
        model = PackagingProfile
        fields = [
            "id",
            "code",
            "name",
            "finished_item",
            "finished_item_name",
            "scope",
            "is_active",
            "current_version",
        ]

    def get_current_version(self, obj: PackagingProfile) -> dict[str, Any] | None:
        version = obj.current_version()
        if version is None:
            return None
        return PackagingProfileVersionSerializer(version).data

    def create(self, validated_data: dict[str, Any]) -> PackagingProfile:
        organization = Organization.get_default()
        profile = PackagingProfile.objects.create(organization=organization, **validated_data)
        PackagingProfileVersion.objects.create(
            profile=profile, version_number=1, organization=organization
        )
        return profile
