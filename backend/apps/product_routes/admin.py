from django.contrib import admin

from .models import (
    ProcessRoute,
    ProcessRouteEdge,
    ProcessRouteNode,
    ProcessRouteVersion,
    StorageLocation,
)


@admin.register(StorageLocation)
class StorageLocationAdmin(admin.ModelAdmin):
    list_display = ("name", "is_active")
    list_filter = ("is_active",)
    search_fields = ("name",)


class ProcessRouteNodeInline(admin.TabularInline):
    model = ProcessRouteNode
    extra = 0


class ProcessRouteEdgeInline(admin.TabularInline):
    model = ProcessRouteEdge
    fk_name = "route_version"
    extra = 0


@admin.register(ProcessRouteVersion)
class ProcessRouteVersionAdmin(admin.ModelAdmin):
    list_display = ("process_route", "version_number", "status", "is_default")
    list_filter = ("status", "is_default")
    search_fields = ("process_route__name",)
    autocomplete_fields = ("process_route",)
    inlines = [ProcessRouteNodeInline, ProcessRouteEdgeInline]


@admin.register(ProcessRoute)
class ProcessRouteAdmin(admin.ModelAdmin):
    list_display = ("name", "item", "is_active")
    list_filter = ("is_active",)
    search_fields = ("name", "item__name", "item__code")
    autocomplete_fields = ("item",)
