from django.contrib import admin

from .models import Process, ProcessCategory


@admin.register(ProcessCategory)
class ProcessCategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "is_active")
    list_filter = ("is_active",)
    search_fields = ("name",)


@admin.register(Process)
class ProcessAdmin(admin.ModelAdmin):
    list_display = ("name", "category", "resource_type", "is_active")
    list_filter = ("category", "resource_type", "is_active")
    search_fields = ("name",)
    autocomplete_fields = ("category", "inputs", "outputs")
