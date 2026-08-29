from django.contrib import admin

from .models import UOM, Item, ItemFieldRule, MaterialType, NamingTemplate, ProductType, Shape


@admin.register(UOM)
class UOMAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "decimal_scale", "is_active")
    list_filter = ("is_active",)
    search_fields = ("code", "name")


@admin.register(ProductType)
class ProductTypeAdmin(admin.ModelAdmin):
    list_display = ("name", "short_code", "applicable_item_classes", "is_active")
    list_filter = ("is_active",)
    search_fields = ("name",)


@admin.register(MaterialType)
class MaterialTypeAdmin(admin.ModelAdmin):
    list_display = ("name", "short_code", "applicable_item_classes", "is_active")
    list_filter = ("is_active",)
    search_fields = ("name",)


@admin.register(ItemFieldRule)
class ItemFieldRuleAdmin(admin.ModelAdmin):
    list_display = ("item_class", "field", "state")
    list_filter = ("item_class", "field", "state")


@admin.register(Shape)
class ShapeAdmin(admin.ModelAdmin):
    list_display = ("name", "short_code", "is_active")
    list_filter = ("is_active",)
    search_fields = ("name",)


@admin.register(NamingTemplate)
class NamingTemplateAdmin(admin.ModelAdmin):
    list_display = ("item_class", "product_type", "name_pattern", "code_pattern", "is_active")
    list_filter = ("item_class", "is_active")
    autocomplete_fields = ("product_type",)


@admin.register(Item)
class ItemAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "item_class", "is_active")
    list_filter = ("item_class", "is_active")
    search_fields = ("code", "name")
    autocomplete_fields = ("product_type", "material_type", "shape", "inventory_uom")
