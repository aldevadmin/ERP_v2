from django.contrib import admin

from .models import Customer, CustomerAddress


class CustomerAddressInline(admin.TabularInline):
    model = CustomerAddress
    extra = 0


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "main_poc", "internal_coordinator", "is_active")
    list_filter = ("is_active",)
    search_fields = ("code", "name")
    autocomplete_fields = ("internal_coordinator",)
    inlines = [CustomerAddressInline]
