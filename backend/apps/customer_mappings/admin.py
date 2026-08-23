from django.contrib import admin

from .models import (
    CustomerProductMapping,
    CustomerProductMappingVersion,
    MappingFile,
    MappingRequirement,
)


class MappingRequirementInline(admin.TabularInline):
    model = MappingRequirement
    extra = 0


class MappingFileInline(admin.TabularInline):
    model = MappingFile
    extra = 0


@admin.register(CustomerProductMappingVersion)
class CustomerProductMappingVersionAdmin(admin.ModelAdmin):
    list_display = ("mapping", "version_number", "status")
    list_filter = ("status",)
    inlines = [MappingRequirementInline, MappingFileInline]


@admin.register(CustomerProductMapping)
class CustomerProductMappingAdmin(admin.ModelAdmin):
    list_display = ("customer", "item", "customer_sku", "mapping_code", "is_active")
    search_fields = ("mapping_code", "customer_sku", "customer__name", "item__name", "item__code")
    autocomplete_fields = ("customer", "item")
