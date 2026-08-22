from django.contrib import admin

from .models import (
    Tooling,
    ToolingAssignment,
    ToolingCompatibility,
    ToolingType,
    WorkCentrePosition,
)


class ToolingCompatibilityInline(admin.TabularInline):
    model = ToolingCompatibility
    extra = 0


@admin.register(ToolingType)
class ToolingTypeAdmin(admin.ModelAdmin):
    list_display = ("name", "is_active")
    list_filter = ("is_active",)
    search_fields = ("name",)


@admin.register(Tooling)
class ToolingAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "tooling_type", "is_active")
    list_filter = ("tooling_type", "is_active")
    search_fields = ("code", "name")
    inlines = [ToolingCompatibilityInline]


@admin.register(WorkCentrePosition)
class WorkCentrePositionAdmin(admin.ModelAdmin):
    list_display = ("work_centre", "position_index", "display_label", "is_active")
    list_filter = ("is_active",)
    search_fields = ("work_centre__name", "display_label")
    autocomplete_fields = ("work_centre",)


@admin.register(ToolingAssignment)
class ToolingAssignmentAdmin(admin.ModelAdmin):
    list_display = ("tooling", "work_centre_position", "effective_from", "effective_to")
    list_filter = ("tooling",)
    search_fields = ("tooling__code", "tooling__name")
    autocomplete_fields = ("tooling", "work_centre_position", "default_item")
