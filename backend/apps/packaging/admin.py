from django.contrib import admin

from .models import PackagingProfile, PackagingProfileMaterial, PackagingProfileVersion


class PackagingProfileMaterialInline(admin.TabularInline):
    model = PackagingProfileMaterial
    extra = 0
    autocomplete_fields = ("item", "uom")


@admin.register(PackagingProfileVersion)
class PackagingProfileVersionAdmin(admin.ModelAdmin):
    list_display = ("profile", "version_number", "status")
    list_filter = ("status",)
    inlines = [PackagingProfileMaterialInline]


@admin.register(PackagingProfile)
class PackagingProfileAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "finished_item", "scope", "is_active")
    search_fields = ("name", "code")
    autocomplete_fields = ("finished_item",)
