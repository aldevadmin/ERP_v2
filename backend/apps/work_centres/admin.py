from django.contrib import admin

from .models import WorkCentre, WorkCentreProcessCapability, WorkCentreType


class WorkCentreProcessCapabilityInline(admin.TabularInline):
    model = WorkCentreProcessCapability
    extra = 0
    autocomplete_fields = ("process_definition",)


@admin.register(WorkCentreType)
class WorkCentreTypeAdmin(admin.ModelAdmin):
    list_display = ("name", "is_active")
    list_filter = ("is_active",)
    search_fields = ("name",)


@admin.register(WorkCentre)
class WorkCentreAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "type", "is_active")
    list_filter = ("type", "is_active")
    search_fields = ("code", "name")
    inlines = [WorkCentreProcessCapabilityInline]
