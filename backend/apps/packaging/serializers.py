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


class PackagingProfileMaterialUsageSerializer(serializers.ModelSerializer):
    """Read-only reverse view of `PackagingProfileMaterial` from a
    Packaging Material item's side — "which Finished Goods use this carton,
    via which Packaging Profile, and how many pieces per box" — for the
    Item form's "Used In Packaging Profiles" card. Mirrors
    `customer_mappings.CustomerProductMappingSerializer`'s `?item=` reverse
    lookup, one layer down (a version's materials, not the profile itself).
    """

    profile_id = serializers.IntegerField(source="version.profile.id", read_only=True)
    profile_name = serializers.CharField(source="version.profile.name", read_only=True)
    profile_code = serializers.CharField(source="version.profile.code", read_only=True)
    finished_item_name = serializers.CharField(
        source="version.profile.finished_item.name", read_only=True
    )
    version_number = serializers.IntegerField(source="version.version_number", read_only=True)
    version_status = serializers.CharField(source="version.status", read_only=True)
    pieces_per_selling_unit = serializers.IntegerField(
        source="version.pieces_per_selling_unit", read_only=True
    )
    uom_code = serializers.CharField(source="uom.code", read_only=True)

    class Meta:
        model = PackagingProfileMaterial
        fields = [
            "id",
            "profile_id",
            "profile_name",
            "profile_code",
            "finished_item_name",
            "version_number",
            "version_status",
            "pieces_per_selling_unit",
            "level",
            "quantity",
            "uom_code",
        ]


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

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        # Once any version of this profile has ever been published, changing
        # `finished_item` would retroactively redefine what that (possibly
        # already Customer-Mapping-pinned) version means — exactly what the
        # immutable-published-version guarantee elsewhere on this model
        # exists to prevent. A still-all-draft profile (never published) can
        # still have this corrected freely.
        new_finished_item = attrs.get("finished_item")
        if (
            self.instance
            and new_finished_item is not None
            and new_finished_item != self.instance.finished_item
            and self.instance.versions.exclude(status=PackagingProfileVersion.Status.DRAFT).exists()
        ):
            raise serializers.ValidationError(
                {
                    "finished_item": (
                        "Can't change the finished item once a version of this profile has "
                        "been published — create a new profile instead."
                    )
                }
            )
        return attrs

    def create(self, validated_data: dict[str, Any]) -> PackagingProfile:
        organization = Organization.get_default()
        profile = PackagingProfile.objects.create(organization=organization, **validated_data)
        PackagingProfileVersion.objects.create(
            profile=profile, version_number=1, organization=organization
        )
        return profile
