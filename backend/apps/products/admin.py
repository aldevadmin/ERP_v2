from django.contrib import admin

from .models import CustomerSKUMapping, CustomerSKUMappingFile, Product


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ("sku_code", "name", "base_unit", "is_active")
    list_filter = ("is_active",)
    search_fields = ("sku_code", "name")


class CustomerSKUMappingFileInline(admin.TabularInline):
    model = CustomerSKUMappingFile
    extra = 0
    readonly_fields = ("file",)


@admin.register(CustomerSKUMapping)
class CustomerSKUMappingAdmin(admin.ModelAdmin):
    list_display = ("customer", "customer_sku_code", "product", "customer_description")
    list_filter = ("customer",)
    search_fields = ("customer_sku_code", "customer_description", "product__sku_code")
    autocomplete_fields = ("customer", "product")
    inlines = [CustomerSKUMappingFileInline]
