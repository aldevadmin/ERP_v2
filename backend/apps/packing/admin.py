from django.contrib import admin

from .models import (
    PackingExecutionConfig,
    PackingIntervalRecord,
    PackingJob,
    PackingMaterialMovement,
    PackingMaterialRequest,
    PackingMaterialRequestLine,
    PackingPlanLine,
    PackingShift,
    PackingWorkCentreAllocation,
    PackingWorkCentreSession,
    PackingWorkCentreSessionOperator,
    Shift,
    WorkCentreIssueEvent,
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


@admin.register(PackingExecutionConfig)
class PackingExecutionConfigAdmin(admin.ModelAdmin):
    list_display = ("organization", "recording_mode", "default_interval_minutes", "plan_calculation")


@admin.register(PackingShift)
class PackingShiftAdmin(admin.ModelAdmin):
    list_display = ("date", "shift", "status", "started_at", "stopped_at")
    list_filter = ("status", "shift")


class PackingWorkCentreSessionOperatorInline(admin.TabularInline):
    model = PackingWorkCentreSessionOperator
    extra = 0


@admin.register(PackingWorkCentreSession)
class PackingWorkCentreSessionAdmin(admin.ModelAdmin):
    list_display = ("packing_shift", "work_centre", "bay", "status", "started_at", "stopped_at")
    list_filter = ("status", "bay")
    inlines = [PackingWorkCentreSessionOperatorInline]


@admin.register(PackingWorkCentreAllocation)
class PackingWorkCentreAllocationAdmin(admin.ModelAdmin):
    list_display = ("job", "session", "sequence", "assigned_qty", "status")
    list_filter = ("status",)


@admin.register(WorkCentreIssueEvent)
class WorkCentreIssueEventAdmin(admin.ModelAdmin):
    list_display = ("session", "issue_type", "stops_productive_time", "started_at", "resolved_at")
    list_filter = ("issue_type", "stops_productive_time")


@admin.register(PackingIntervalRecord)
class PackingIntervalRecordAdmin(admin.ModelAdmin):
    list_display = ("allocation", "from_time", "to_time", "status", "premium_qty", "standard_qty", "reject_qty")
    list_filter = ("status",)
