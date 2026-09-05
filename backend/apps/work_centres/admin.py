from django.contrib import admin

from .models import Bay, WorkCentre, WorkCentreProcessCapability, WorkCentreType


class WorkCentreProcessCapabilityInline(admin.TabularInline):
    model = WorkCentreProcessCapability
    extra = 0
    autocomplete_fields = ("process_definition",)


@admin.register(WorkCentreType)
class WorkCentreTypeAdmin(admin.ModelAdmin):
    list_display = ("name", "is_active")
    list_filter = ("is_active",)
    search_fields = ("name",)


@admin.register(Bay)
class BayAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "is_active")
    search_fields = ("code", "name")


@admin.register(WorkCentre)
class WorkCentreAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "type", "bay", "is_active")
    list_filter = ("type", "bay", "is_active")
    search_fields = ("code", "name")
    inlines = [WorkCentreProcessCapabilityInline]
