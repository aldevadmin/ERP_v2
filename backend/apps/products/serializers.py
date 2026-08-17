from typing import Any

from rest_framework import serializers

from apps.core.models import Organization

from .models import CustomerSKUMapping, CustomerSKUMappingFile, Product

MAX_FILES_PER_CATEGORY = {
    CustomerSKUMappingFile.Category.PLATE_IMAGE: 10,
    CustomerSKUMappingFile.Category.POUCH_IMAGE: 10,
    CustomerSKUMappingFile.Category.DESIGN_FILE: 10,
    CustomerSKUMappingFile.Category.RETAIL_STICKER_IMAGE: 3,
}


class ProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = ["id", "sku_code", "name", "description", "base_unit", "is_active"]

    def create(self, validated_data: dict[str, Any]) -> Product:
        return Product.objects.create(organization=Organization.get_default(), **validated_data)


class CustomerSKUMappingFileSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomerSKUMappingFile
        fields = ["id", "category", "file", "created_at"]

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        mapping: CustomerSKUMapping = self.context["customer_sku_mapping"]
        category = attrs["category"]
        cap = MAX_FILES_PER_CATEGORY[category]
        existing = CustomerSKUMappingFile.objects.filter(
            customer_sku_mapping=mapping, category=category
        ).count()
        if existing >= cap:
            raise serializers.ValidationError(
                {"file": f"Maximum of {cap} files reached for this category."}
            )
        return attrs

    def create(self, validated_data: dict[str, Any]) -> CustomerSKUMappingFile:
        return CustomerSKUMappingFile.objects.create(
            customer_sku_mapping=self.context["customer_sku_mapping"], **validated_data
        )


class CustomerSKUMappingSerializer(serializers.ModelSerializer):
    """Every Decimal field below is declared explicitly with
    `coerce_to_string=False` — DRF's default renders Decimals as strings
    (`"123.45"`), but these are plain numeric measurements the frontend
    binds straight to `InputNumber`, so the wire format should be a real
    JSON number, not a string it would have to parse first.
    """

    customer_name = serializers.CharField(source="customer.name", read_only=True)
    product_sku_code = serializers.CharField(source="product.sku_code", read_only=True)
    product_name = serializers.CharField(source="product.name", read_only=True)
    pieces_per_carton = serializers.IntegerField(read_only=True)
    files = CustomerSKUMappingFileSerializer(many=True, read_only=True)

    pouch_height_inches = serializers.DecimalField(
        max_digits=8, decimal_places=2, coerce_to_string=False, allow_null=True, required=False
    )
    carton_length_mm = serializers.DecimalField(
        max_digits=8, decimal_places=2, coerce_to_string=False, allow_null=True, required=False
    )
    carton_breadth_mm = serializers.DecimalField(
        max_digits=8, decimal_places=2, coerce_to_string=False, allow_null=True, required=False
    )
    carton_height_mm = serializers.DecimalField(
        max_digits=8, decimal_places=2, coerce_to_string=False, allow_null=True, required=False
    )
    carton_net_weight_kg = serializers.DecimalField(
        max_digits=8, decimal_places=2, coerce_to_string=False, allow_null=True, required=False
    )
    carton_gross_weight_kg = serializers.DecimalField(
        max_digits=8, decimal_places=2, coerce_to_string=False, allow_null=True, required=False
    )
    pouch_thickness_microns = serializers.DecimalField(
        max_digits=8, decimal_places=2, coerce_to_string=False, allow_null=True, required=False
    )
    pouch_length_mm = serializers.DecimalField(
        max_digits=8, decimal_places=2, coerce_to_string=False, allow_null=True, required=False
    )
    pouch_breadth_mm = serializers.DecimalField(
        max_digits=8, decimal_places=2, coerce_to_string=False, allow_null=True, required=False
    )
    pouch_height_mm = serializers.DecimalField(
        max_digits=8, decimal_places=2, coerce_to_string=False, allow_null=True, required=False
    )

    class Meta:
        model = CustomerSKUMapping
        fields = [
            "id",
            "customer",
            "customer_name",
            "customer_sku_code",
            "customer_description",
            "product",
            "product_sku_code",
            "product_name",
            "pieces_per_pouch",
            "pouches_per_carton",
            "pieces_per_carton",
            "pouch_height_inches",
            "carton_ply_rating",
            "carton_length_mm",
            "carton_breadth_mm",
            "carton_height_mm",
            "carton_net_weight_kg",
            "carton_gross_weight_kg",
            "pouch_thickness_microns",
            "pouch_length_mm",
            "pouch_breadth_mm",
            "pouch_height_mm",
            "has_retail_sticker",
            "retail_sticker_comments",
            "has_silica_gel",
            "other_packing_requirements",
            "files",
        ]
