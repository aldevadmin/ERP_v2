from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import Employee, Team, User

admin.site.register(User, UserAdmin)


@admin.register(Team)
class TeamAdmin(admin.ModelAdmin):
    list_display = ("name", "organization", "is_active")
    list_filter = ("organization", "is_active")
    search_fields = ("name",)


@admin.register(Employee)
class EmployeeAdmin(admin.ModelAdmin):
    list_display = ("employee_code", "full_name", "team", "designation", "user", "is_active")
    list_filter = ("organization", "team", "is_active")
    search_fields = ("employee_code", "full_name")
    autocomplete_fields = ("user",)
