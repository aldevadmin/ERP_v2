from django.contrib import admin

from .models import (
    ProcessRouteEdgeV1,
    ProcessRouteItemMappingV1,
    ProcessRouteNodeV1,
    ProcessRouteV1,
    ProcessRouteVersionV1,
)


class ProcessRouteNodeV1Inline(admin.TabularInline):
    model = ProcessRouteNodeV1
    extra = 0


class ProcessRouteEdgeV1Inline(admin.TabularInline):
    model = ProcessRouteEdgeV1
    fk_name = "route_version"
    extra = 0


class ProcessRouteItemMappingV1Inline(admin.TabularInline):
    model = ProcessRouteItemMappingV1
    extra = 0


@admin.register(ProcessRouteVersionV1)
class ProcessRouteVersionV1Admin(admin.ModelAdmin):
    list_display = ("process_route", "version_number", "status", "is_default")
    list_filter = ("status", "is_default")
    search_fields = ("process_route__name",)
    autocomplete_fields = ("process_route",)
    inlines = [ProcessRouteNodeV1Inline, ProcessRouteEdgeV1Inline, ProcessRouteItemMappingV1Inline]


@admin.register(ProcessRouteV1)
class ProcessRouteV1Admin(admin.ModelAdmin):
    list_display = ("name", "item_group", "is_active")
    list_filter = ("is_active",)
    search_fields = ("name", "item_group__name")
    autocomplete_fields = ("item_group",)
