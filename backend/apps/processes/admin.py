from django.contrib import admin

from .models import (
    OutputClassification,
    ProcessCategory,
    ProcessDefinition,
    ProcessDefinitionVersion,
    ProcessInputDefinition,
    ProcessOutputDefinition,
    ProcessParameterDefinition,
)


@admin.register(ProcessCategory)
class ProcessCategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "is_active")
    list_filter = ("is_active",)
    search_fields = ("name",)


@admin.register(OutputClassification)
class OutputClassificationAdmin(admin.ModelAdmin):
    list_display = ("name", "is_active")
    list_filter = ("is_active",)
    search_fields = ("name",)


class ProcessInputDefinitionInline(admin.TabularInline):
    model = ProcessInputDefinition
    extra = 0


class ProcessOutputDefinitionInline(admin.TabularInline):
    model = ProcessOutputDefinition
    extra = 0


class ProcessParameterDefinitionInline(admin.TabularInline):
    model = ProcessParameterDefinition
    extra = 0


@admin.register(ProcessDefinitionVersion)
class ProcessDefinitionVersionAdmin(admin.ModelAdmin):
    list_display = (
        "process_definition",
        "version_number",
        "status",
        "category",
        "work_centre_requirement",
    )
    list_filter = ("status", "category", "work_centre_requirement")
    search_fields = ("process_definition__name", "process_definition__code")
    autocomplete_fields = ("process_definition", "category")
    inlines = [
        ProcessInputDefinitionInline,
        ProcessOutputDefinitionInline,
        ProcessParameterDefinitionInline,
    ]


@admin.register(ProcessDefinition)
class ProcessDefinitionAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "is_active")
    list_filter = ("is_active",)
    search_fields = ("name", "code")
