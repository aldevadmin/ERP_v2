from django.contrib import admin

from .models import Material


@admin.register(Material)
class MaterialAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "unit", "category", "is_active")
    list_filter = ("category", "is_active")
    search_fields = ("code", "name")
