from django.contrib import admin

from .models import (
    PackingAllocationOperator,
    PackingJob,
    PackingMaterialMovement,
    PackingMaterialRequest,
    PackingMaterialRequestLine,
    PackingPlanLine,
    PackingWorkCentreAllocation,
    PackingWorkSession,
    Shift,
)


@admin.register(Shift)
class ShiftAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "start_time", "end_time", "is_active")
    search_fields = ("name", "code")


@admin.register(PackingPlanLine)
class PackingPlanLineAdmin(admin.ModelAdmin):
    list_display = ("export_order_line", "date", "shift", "bay", "planned_qty", "status")
    list_filter = ("status", "shift", "bay")


@admin.register(PackingJob)
class PackingJobAdmin(admin.ModelAdmin):
    list_display = ("job_number", "plan_line", "target_qty", "status")
    list_filter = ("status",)
    search_fields = ("job_number",)


class PackingMaterialRequestLineInline(admin.TabularInline):
    model = PackingMaterialRequestLine
    extra = 0


@admin.register(PackingMaterialRequest)
class PackingMaterialRequestAdmin(admin.ModelAdmin):
    list_display = ("job", "source_location", "required_by")
    inlines = [PackingMaterialRequestLineInline]


@admin.register(PackingMaterialMovement)
class PackingMaterialMovementAdmin(admin.ModelAdmin):
    list_display = ("request_line", "date", "quantity_issued", "quantity_received")


class PackingAllocationOperatorInline(admin.TabularInline):
    model = PackingAllocationOperator
    extra = 0


@admin.register(PackingWorkCentreAllocation)
class PackingWorkCentreAllocationAdmin(admin.ModelAdmin):
    list_display = ("job", "work_centre", "date", "shift", "sequence", "assigned_qty", "status")
    list_filter = ("status", "shift", "work_centre")
    inlines = [PackingAllocationOperatorInline]


@admin.register(PackingWorkSession)
class PackingWorkSessionAdmin(admin.ModelAdmin):
    list_display = ("allocation", "status", "started_at", "completed_at")
    list_filter = ("status",)
