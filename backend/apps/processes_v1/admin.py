from django.contrib import admin

from .models import (
    ProcessDefinitionV1,
    ProcessDefinitionVersionV1,
    ProcessInputDefinitionV1,
    ProcessOutputDefinitionV1,
)


class ProcessInputDefinitionV1Inline(admin.TabularInline):
    model = ProcessInputDefinitionV1
    extra = 0


class ProcessOutputDefinitionV1Inline(admin.TabularInline):
    model = ProcessOutputDefinitionV1
    extra = 0


@admin.register(ProcessDefinitionVersionV1)
class ProcessDefinitionVersionV1Admin(admin.ModelAdmin):
    list_display = ("process_definition", "version_number", "status", "category")
    list_filter = ("status", "category")
    search_fields = ("process_definition__name", "process_definition__code")
    autocomplete_fields = ("process_definition", "category")
    inlines = [ProcessInputDefinitionV1Inline, ProcessOutputDefinitionV1Inline]


@admin.register(ProcessDefinitionV1)
class ProcessDefinitionV1Admin(admin.ModelAdmin):
    list_display = ("name", "code", "is_active")
    list_filter = ("is_active",)
    search_fields = ("name", "code")
