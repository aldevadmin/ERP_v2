from django.contrib import admin

from .models import Vendor


@admin.register(Vendor)
class VendorAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "category", "organization", "is_active")
    list_filter = ("organization", "is_active")
    search_fields = ("name", "code")
