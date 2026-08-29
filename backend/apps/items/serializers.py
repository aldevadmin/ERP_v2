from typing import Any

from rest_framework import serializers

from apps.core.models import Organization

from .models import UOM, Item, ItemFieldRule, MaterialType, NamingTemplate, ProductType, Shape

# `dimensions` (one ItemFieldRule row) maps to three actual Item columns —
# there's no single "dimensions" field on the model itself.
_DIMENSION_MODEL_FIELDS = ("length_in", "breadth_in", "height_mm")


def _field_rules_for_class(item_class: str) -> dict[str, str]:
    """{field: state} for the four class-varying fields
    (product_type/material_type/shape/dimensions) — the live,
    admin-configured replacement for what used to be hardcoded
    `_REQUIRED_FIELDS_BY_CLASS`/`_HIDDEN_FIELDS_BY_CLASS` dicts here. See
    `ItemFieldRule`'s docstring for why this axis specifically became
    database-driven rather than staying in code."""
    return dict(
        ItemFieldRule.objects.filter(item_class=item_class).values_list("field", "state")
    )


class UOMSerializer(serializers.ModelSerializer):
    class Meta:
        model = UOM
        fields = ["id", "code", "name", "decimal_scale", "is_active"]

    def create(self, validated_data: dict[str, Any]) -> UOM:
        return UOM.objects.create(organization=Organization.get_default(), **validated_data)


class ProductTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductType
        fields = ["id", "name", "short_code", "applicable_item_classes", "is_active"]

    def create(self, validated_data: dict[str, Any]) -> ProductType:
        return ProductType.objects.create(organization=Organization.get_default(), **validated_data)


class MaterialTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = MaterialType
        fields = ["id", "name", "short_code", "applicable_item_classes", "is_active"]

    def create(self, validated_data: dict[str, Any]) -> MaterialType:
        return MaterialType.objects.create(
            organization=Organization.get_default(), **validated_data
        )


class ItemFieldRuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = ItemFieldRule
        fields = ["id", "item_class", "field", "state"]
        read_only_fields = ["item_class", "field"]


class ShapeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Shape
        fields = ["id", "name", "short_code", "is_active"]

    def create(self, validated_data: dict[str, Any]) -> Shape:
        return Shape.objects.create(organization=Organization.get_default(), **validated_data)


class NamingTemplateSerializer(serializers.ModelSerializer):
    product_type_name = serializers.CharField(
        source="product_type.name", read_only=True, default=""
    )
    shape_name = serializers.CharField(source="shape.name", read_only=True, default="")

    class Meta:
        model = NamingTemplate
        fields = [
            "id",
            "item_class",
            "product_type",
            "product_type_name",
            "shape",
            "shape_name",
            "name_pattern",
            "code_pattern",
            "is_active",
        ]

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        existing_class = getattr(self.instance, "item_class", "") if self.instance else ""
        item_class = str(attrs.get("item_class") or existing_class)

        # A Product Type scope can only ever match a real item if that
        # item's own form actually lets Product Type be set — same rule
        # `ItemSerializer` enforces on the Item itself, reused here so a
        # template can't be scoped to a value no item of that class will
        # ever carry (which would make it silently unmatchable forever).
        if _field_rules_for_class(item_class).get("product_type") == ItemFieldRule.State.HIDDEN:
            attrs["product_type"] = None

        # No DB constraint backs this — see the model's Meta docstring on
        # why (two independent optional scopes make the partial-index
        # matrix awkward) — so the exact-duplicate-scope check lives here
        # instead, the same place any conditional-constraint check has to
        # live regardless (DRF can't auto-derive a validator for one).
        product_type = attrs.get("product_type", getattr(self.instance, "product_type", None))
        shape = attrs.get("shape", getattr(self.instance, "shape", None))
        conflict = NamingTemplate.objects.filter(
            item_class=item_class, product_type=product_type, shape=shape
        )
        if self.instance:
            conflict = conflict.exclude(pk=self.instance.pk)
        if conflict.exists():
            raise serializers.ValidationError(
                "A naming template already exists for this item class, product type, and shape."
            )
        return attrs

    def create(self, validated_data: dict[str, Any]) -> NamingTemplate:
        return NamingTemplate.objects.create(
            organization=Organization.get_default(), **validated_data
        )


class ItemSerializer(serializers.ModelSerializer):
    product_type_name = serializers.CharField(
        source="product_type.name", read_only=True, default=""
    )
    material_type_name = serializers.CharField(
        source="material_type.name", read_only=True, default=""
    )
    shape_name = serializers.CharField(source="shape.name", read_only=True, default="")
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
            "shape",
            "shape_name",
            "length_in",
            "breadth_in",
            "height_mm",
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
        rules = _field_rules_for_class(item_class)

        # inventory_uom is required for every class, with no demonstrated
        # need to vary — not part of `ItemFieldRule` (see its docstring).
        required = {"inventory_uom"} | {
            field
            for field in ("product_type", "material_type", "shape")
            if rules.get(field) == ItemFieldRule.State.REQUIRED
        }
        if rules.get("dimensions") == ItemFieldRule.State.REQUIRED:
            # Only length/height, never breadth — breadth is legitimately
            # optional even when dimensions matter (a round item has none;
            # see `buildDimensionToken` on the frontend, which treats
            # length+height as the real minimum for a usable dimension).
            required.update({"length_in", "height_mm"})

        hidden_fields = {
            field
            for field in ("product_type", "material_type", "shape")
            if rules.get(field) == ItemFieldRule.State.HIDDEN
        }
        if rules.get("dimensions") == ItemFieldRule.State.HIDDEN:
            hidden_fields.update(_DIMENSION_MODEL_FIELDS)

        errors: dict[str, str] = {}
        for field in required:
            value = attrs.get(field, getattr(self.instance, field, None) if self.instance else None)
            if value is None:
                errors[field] = "This field is required for the selected item class."
        if errors:
            raise serializers.ValidationError(errors)

        for field in hidden_fields:
            attrs[field] = None

        return attrs

    def create(self, validated_data: dict[str, Any]) -> Item:
        return Item.objects.create(organization=Organization.get_default(), **validated_data)
