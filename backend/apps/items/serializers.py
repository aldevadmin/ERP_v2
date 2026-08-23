from typing import Any

from rest_framework import serializers

from apps.core.models import Organization

from .models import UOM, Item, MaterialType, ProductType

# Which of product_type/material_type/inventory_uom each item_class
# requires, and which it hides outright (silently cleared on save rather
# than erroring, since the frontend never shows a hidden field to begin
# with). See the field-by-class table in `Item`'s docstring.
_REQUIRED_FIELDS_BY_CLASS: dict[str, set[str]] = {
    Item.ItemClass.RAW_MATERIAL: {"material_type", "inventory_uom"},
    Item.ItemClass.WIP: {"product_type", "material_type", "inventory_uom"},
    Item.ItemClass.FINISHED_GOOD: {"product_type", "material_type", "inventory_uom"},
    Item.ItemClass.PACKAGING_MATERIAL: {"product_type", "material_type", "inventory_uom"},
    Item.ItemClass.CONSUMABLE: {"inventory_uom"},
    Item.ItemClass.SCRAP_BY_PRODUCT: {"inventory_uom"},
}
_HIDDEN_FIELDS_BY_CLASS: dict[str, set[str]] = {
    Item.ItemClass.RAW_MATERIAL: {"product_type"},
}


class UOMSerializer(serializers.ModelSerializer):
    class Meta:
        model = UOM
        fields = ["id", "code", "name", "decimal_scale", "is_active"]

    def create(self, validated_data: dict[str, Any]) -> UOM:
        return UOM.objects.create(organization=Organization.get_default(), **validated_data)


class ProductTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductType
        fields = ["id", "name", "is_active"]

    def create(self, validated_data: dict[str, Any]) -> ProductType:
        return ProductType.objects.create(organization=Organization.get_default(), **validated_data)


class MaterialTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = MaterialType
        fields = ["id", "name", "is_active"]

    def create(self, validated_data: dict[str, Any]) -> MaterialType:
        return MaterialType.objects.create(
            organization=Organization.get_default(), **validated_data
        )


class ItemSerializer(serializers.ModelSerializer):
    product_type_name = serializers.CharField(
        source="product_type.name", read_only=True, default=""
    )
    material_type_name = serializers.CharField(
        source="material_type.name", read_only=True, default=""
    )
    inventory_uom_code = serializers.CharField(
        source="inventory_uom.code", read_only=True, default=""
    )

    class Meta:
        model = Item
        fields = [
            "id",
            "code",
            "name",
            "description",
            "item_class",
            "product_type",
            "product_type_name",
            "material_type",
            "material_type_name",
            "inventory_uom",
            "inventory_uom_code",
            "purchasable",
            "manufacturable",
            "stockable",
            "sellable",
            "lot_tracking",
            "is_active",
            "available_qty",
        ]
        read_only_fields = ["available_qty"]

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        existing_class = getattr(self.instance, "item_class", "") if self.instance else ""
        item_class = str(attrs.get("item_class") or existing_class)
        required = _REQUIRED_FIELDS_BY_CLASS.get(item_class, set())
        hidden = _HIDDEN_FIELDS_BY_CLASS.get(item_class, set())

        errors: dict[str, str] = {}
        for field in required:
            value = attrs.get(field, getattr(self.instance, field, None) if self.instance else None)
            if value is None:
                errors[field] = "This field is required for the selected item class."
        if errors:
            raise serializers.ValidationError(errors)

        for field in hidden:
            attrs[field] = None

        return attrs

    def create(self, validated_data: dict[str, Any]) -> Item:
        return Item.objects.create(organization=Organization.get_default(), **validated_data)
