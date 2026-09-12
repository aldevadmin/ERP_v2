from typing import Any

from django.utils import timezone
from rest_framework import serializers

from apps.accounts.models import Employee
from apps.core.models import Organization
from apps.items.models import Item

from .models import (
    PackingExecutionConfig,
    PackingIntervalRecord,
    PackingJob,
    PackingJobEvent,
    PackingMaterialMovement,
    PackingMaterialRequest,
    PackingMaterialRequestLine,
    PackingPlanLine,
    PackingRecordingBlock,
    PackingRecordingSchedule,
    PackingRecordingScheduleVersion,
    PackingShift,
    PackingWorkCentreAllocation,
    PackingWorkCentreSession,
    PackingWorkCentreSessionOperator,
    Shift,
    WorkCentreIssueEvent,
)
from .services import MaterialRequirementRow, PackingDemandRow, job_has_running_allocation


class ShiftSerializer(serializers.ModelSerializer):
    class Meta:
        model = Shift
        fields = ["id", "name", "code", "start_time", "end_time", "is_active"]

    def create(self, validated_data: dict[str, Any]) -> Shift:
        return Shift.objects.create(organization=Organization.get_default(), **validated_data)


class PackingDemandSerializer(serializers.Serializer):
    """Read-only projection of `PackingDemandRow` — not a `ModelSerializer`
    since nothing here is stored (spec §Phase 1: "a query/read model may
    be enough").
    """

    export_order_line_id = serializers.SerializerMethodField()
    order_no = serializers.SerializerMethodField()
    customer_name = serializers.SerializerMethodField()
    line_number = serializers.SerializerMethodField()
    item_name = serializers.SerializerMethodField()
    item_code = serializers.SerializerMethodField()
    customer_sku_code = serializers.SerializerMethodField()
    required_qty = serializers.IntegerField()
    packable_qty = serializers.IntegerField()
    packed_qty = serializers.IntegerField()
    balance_qty = serializers.IntegerField()
    planned_qty = serializers.IntegerField()
    unplanned_qty = serializers.IntegerField()
    packing_due_date = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()
    has_plan = serializers.SerializerMethodField()

    def get_export_order_line_id(self, obj: PackingDemandRow) -> int:
        return obj.export_order_line.id

    def get_order_no(self, obj: PackingDemandRow) -> str:
        return obj.export_order_line.export_order.order_number

    def get_customer_name(self, obj: PackingDemandRow) -> str:
        return obj.export_order_line.export_order.customer.name

    def get_line_number(self, obj: PackingDemandRow) -> int:
        return obj.export_order_line.line_number

    def get_item_name(self, obj: PackingDemandRow) -> str:
        item = obj.export_order_line.item
        return item.name if item else ""

    def get_item_code(self, obj: PackingDemandRow) -> str:
        item = obj.export_order_line.item
        return item.code if item else ""

    def get_customer_sku_code(self, obj: PackingDemandRow) -> str:
        return obj.export_order_line.customer_sku_code

    def get_packing_due_date(self, obj: PackingDemandRow) -> Any:
        return obj.export_order_line.export_order.requested_shipment_date

    def get_status(self, obj: PackingDemandRow) -> str:
        if obj.balance_qty <= 0:
            return "COMPLETE"
        if obj.packed_qty > 0:
            return "PART_PACKED"
        if obj.planned_qty > 0:
            return "PLANNED"
        return "UNPLANNED"

    def get_has_plan(self, obj: PackingDemandRow) -> bool:
        return obj.planned_qty > 0


class PackingPlanLineSerializer(serializers.ModelSerializer):
    order_no = serializers.CharField(source="export_order_line.export_order.order_number", read_only=True)
    customer_name = serializers.CharField(
        source="export_order_line.export_order.customer.name", read_only=True
    )
    item_name = serializers.CharField(source="export_order_line.item.name", read_only=True, default="")
    shift_name = serializers.CharField(source="shift.name", read_only=True)
    bay_name = serializers.CharField(source="bay.name", read_only=True)
    has_job = serializers.SerializerMethodField()
    job_id = serializers.SerializerMethodField()
    job_number = serializers.SerializerMethodField()
    job_status = serializers.SerializerMethodField()
    job_target_qty = serializers.SerializerMethodField()
    job_packed_qty = serializers.SerializerMethodField()

    class Meta:
        model = PackingPlanLine
        fields = [
            "id",
            "plan_code",
            "export_order_line",
            "order_no",
            "customer_name",
            "item_name",
            "date",
            "shift",
            "shift_name",
            "bay",
            "bay_name",
            "planned_qty",
            "status",
            "remarks",
            "has_job",
            "job_id",
            "job_number",
            "job_status",
            "job_target_qty",
            "job_packed_qty",
        ]
        read_only_fields = ["plan_code"]

    def get_has_job(self, obj: PackingPlanLine) -> bool:
        return getattr(obj, "packing_job", None) is not None

    def get_job_number(self, obj: PackingPlanLine) -> str | None:
        job = getattr(obj, "packing_job", None)
        return job.job_number if job is not None else None

    def get_job_status(self, obj: PackingPlanLine) -> str | None:
        job = getattr(obj, "packing_job", None)
        return job.status if job is not None else None

    def get_job_target_qty(self, obj: PackingPlanLine) -> int | None:
        job = getattr(obj, "packing_job", None)
        return job.target_qty if job is not None else None

    def get_job_packed_qty(self, obj: PackingPlanLine) -> int | None:
        job = getattr(obj, "packing_job", None)
        return job.packed_qty if job is not None else None

    def get_job_id(self, obj: PackingPlanLine) -> int | None:
        job = getattr(obj, "packing_job", None)
        return job.id if job is not None else None

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        from .services import packing_demand_row

        quantity = attrs.get("planned_qty", getattr(self.instance, "planned_qty", None))
        if quantity is not None and quantity <= 0:
            raise serializers.ValidationError({"planned_qty": "Must be greater than zero."})

        line = attrs.get(
            "export_order_line", getattr(self.instance, "export_order_line", None)
        )
        if line is not None and quantity is not None:
            row = packing_demand_row(line)
            already_planned = row.planned_qty
            if self.instance is not None:
                already_planned -= self.instance.planned_qty
            if already_planned + quantity > row.balance_qty:
                raise serializers.ValidationError(
                    {"planned_qty": "Exceeds the currently plannable (unplanned) quantity."}
                )
        return attrs

    def create(self, validated_data: dict[str, Any]) -> PackingPlanLine:
        from .services import generate_plan_code

        # Creating a plan line IS the act of planning it — the Plan
        # Packing modal has one action ("Create Plan"), no separate
        # draft-then-confirm step, so it lands directly in PLANNED rather
        # than the model's own DRAFT default (which nothing in this flow
        # would ever otherwise transition out of).
        return PackingPlanLine.objects.create(
            organization=Organization.get_default(),
            status=PackingPlanLine.Status.PLANNED,
            plan_code=generate_plan_code(validated_data["export_order_line"]),
            **validated_data,
        )


class PackingMaterialRequirementSerializer(serializers.Serializer):
    # Named `item_label`, not `label` — `label` collides with
    # `rest_framework.fields.Field.label` (the field's own display-label
    # attribute), which confuses mypy about this class's attribute type.
    item = serializers.SerializerMethodField()
    item_label = serializers.CharField(source="label")
    required_qty = serializers.IntegerField()
    uom_code = serializers.CharField()

    def get_item(self, obj: MaterialRequirementRow) -> int:
        return obj.item.id


class PackingMaterialMovementSerializer(serializers.ModelSerializer):
    class Meta:
        model = PackingMaterialMovement
        fields = ["id", "date", "quantity_issued", "quantity_received", "remarks", "created_at"]

    def create(self, validated_data: dict[str, Any]) -> PackingMaterialMovement:
        return PackingMaterialMovement.objects.create(
            organization=Organization.get_default(), **validated_data
        )


class PackingMaterialRequestLineSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source="item.name", read_only=True)
    item_code = serializers.CharField(source="item.code", read_only=True)
    issued_qty = serializers.IntegerField(read_only=True)
    received_qty = serializers.IntegerField(read_only=True)
    balance_qty = serializers.IntegerField(read_only=True)
    status = serializers.CharField(read_only=True)
    movements = PackingMaterialMovementSerializer(many=True, read_only=True)

    class Meta:
        model = PackingMaterialRequestLine
        fields = [
            "id",
            "item",
            "item_name",
            "item_code",
            "uom",
            "required_qty",
            "requested_qty",
            "issued_qty",
            "received_qty",
            "balance_qty",
            "status",
            "movements",
        ]


class PackingMaterialRequestLineWriteSerializer(serializers.Serializer):
    item = serializers.PrimaryKeyRelatedField(queryset=Item.objects.all())
    uom = serializers.CharField(max_length=20)
    required_qty = serializers.IntegerField(min_value=0)
    requested_qty = serializers.IntegerField(min_value=1)


class PackingMaterialRequestSerializer(serializers.ModelSerializer):
    lines = PackingMaterialRequestLineSerializer(many=True, read_only=True)
    lines_write = PackingMaterialRequestLineWriteSerializer(many=True, write_only=True)
    status = serializers.CharField(read_only=True)
    source_location_name = serializers.CharField(
        source="source_location.name", read_only=True, default=None
    )

    class Meta:
        model = PackingMaterialRequest
        fields = [
            "id",
            "job",
            "source_location",
            "source_location_name",
            "required_by",
            "remarks",
            "status",
            "lines",
            "lines_write",
        ]

    def create(self, validated_data: dict[str, Any]) -> PackingMaterialRequest:
        lines = validated_data.pop("lines_write")
        organization = Organization.get_default()
        request = PackingMaterialRequest.objects.create(organization=organization, **validated_data)
        for row in lines:
            PackingMaterialRequestLine.objects.create(
                request=request, organization=organization, **row
            )
        return request


class PackingJobSerializer(serializers.ModelSerializer):
    plan_code = serializers.CharField(source="plan_line.plan_code", read_only=True)
    order_no = serializers.CharField(
        source="plan_line.export_order_line.export_order.order_number", read_only=True
    )
    customer_name = serializers.CharField(
        source="plan_line.export_order_line.export_order.customer.name", read_only=True
    )
    item_name = serializers.CharField(
        source="plan_line.export_order_line.item.name", read_only=True, default=""
    )
    customer_sku_code = serializers.CharField(
        source="plan_line.export_order_line.customer_sku_code", read_only=True, default=""
    )
    date = serializers.DateField(source="plan_line.date", read_only=True)
    shift = serializers.IntegerField(source="plan_line.shift_id", read_only=True)
    shift_name = serializers.CharField(source="plan_line.shift.name", read_only=True)
    bay_name = serializers.CharField(source="plan_line.bay.name", read_only=True)
    bay = serializers.IntegerField(source="plan_line.bay_id", read_only=True)
    packed_qty = serializers.IntegerField(read_only=True)
    standard_qty = serializers.IntegerField(read_only=True)
    reject_qty = serializers.IntegerField(read_only=True)
    balance_qty = serializers.IntegerField(read_only=True)
    allocated_qty = serializers.IntegerField(read_only=True)
    packaging_profile_label = serializers.SerializerMethodField()
    has_running_allocation = serializers.SerializerMethodField()
    can_reschedule = serializers.SerializerMethodField()

    class Meta:
        model = PackingJob
        fields = [
            "id",
            "job_number",
            "plan_line",
            "plan_code",
            "order_no",
            "customer_name",
            "item_name",
            "customer_sku_code",
            "packaging_profile_label",
            "date",
            "shift",
            "shift_name",
            "bay",
            "bay_name",
            "target_qty",
            "status",
            "packed_qty",
            "standard_qty",
            "reject_qty",
            "balance_qty",
            "allocated_qty",
            "has_running_allocation",
            "can_reschedule",
            "remarks",
        ]

    def get_packaging_profile_label(self, obj: PackingJob) -> str | None:
        version = obj.packaging_profile_version
        if version is None:
            return None
        return f"{version.profile.code} (v{version.version_number})"

    def get_has_running_allocation(self, obj: PackingJob) -> bool:
        return job_has_running_allocation(obj)

    def get_can_reschedule(self, obj: PackingJob) -> bool:
        """False once the Job's own Plan Line has been cancelled — e.g. a
        Stop with "return to demand" already released this balance back
        to the demand pool for re-planning via Weekly Planner, so there's
        no live Plan Line left here to move to a new date/shift/bay.
        """
        return obj.plan_line.status != PackingPlanLine.Status.CANCELLED


class PackingJobEventSerializer(serializers.ModelSerializer):
    performed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = PackingJobEvent
        fields = [
            "id",
            "job",
            "event_type",
            "reason",
            "remarks",
            "details",
            "performed_by",
            "performed_by_name",
            "created_at",
        ]

    def get_performed_by_name(self, obj: PackingJobEvent) -> str:
        user = obj.performed_by
        if user is None:
            return ""
        return user.get_full_name() or user.get_username()


class PackingExecutionConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = PackingExecutionConfig
        fields = [
            "id",
            "recording_mode",
            "default_interval_minutes",
            "auto_create_expected_intervals",
            "allow_late_entry",
            "missing_record_warning_minutes",
            "plan_calculation",
            "allow_partial_interval_on_sku_change",
        ]


class PackingRecordingBlockSerializer(serializers.ModelSerializer):
    duration_minutes = serializers.IntegerField(read_only=True)

    class Meta:
        model = PackingRecordingBlock
        fields = ["id", "sequence", "from_time", "to_time", "is_active", "duration_minutes"]


class PackingRecordingBlockWriteSerializer(serializers.Serializer):
    sequence = serializers.IntegerField(min_value=1)
    from_time = serializers.TimeField()
    to_time = serializers.TimeField()
    is_active = serializers.BooleanField(default=True)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        if attrs["from_time"] >= attrs["to_time"]:
            raise serializers.ValidationError("Each block's From must be before its To.")
        return attrs


class PackingRecordingScheduleVersionSerializer(serializers.ModelSerializer):
    blocks = PackingRecordingBlockSerializer(many=True, read_only=True)

    class Meta:
        model = PackingRecordingScheduleVersion
        fields = ["id", "schedule", "version_number", "status", "recording_mode", "blocks"]


class PackingRecordingScheduleSerializer(serializers.ModelSerializer):
    shift_name = serializers.CharField(source="shift.name", read_only=True)
    current_version = serializers.SerializerMethodField()

    class Meta:
        model = PackingRecordingSchedule
        fields = ["id", "name", "shift", "shift_name", "is_active", "current_version"]

    def get_current_version(self, obj: PackingRecordingSchedule) -> dict[str, Any] | None:
        version = obj.current_version()
        return PackingRecordingScheduleVersionSerializer(version).data if version else None


class ExpectedBlockSerializer(serializers.Serializer):
    schedule_block_id = serializers.IntegerField(allow_null=True)
    display_label = serializers.CharField()
    from_time = serializers.DateTimeField()
    to_time = serializers.DateTimeField()
    scheduled_minutes = serializers.IntegerField()
    is_partial = serializers.BooleanField()


class PackingIntervalRecordSerializer(serializers.ModelSerializer):
    quality_total = serializers.IntegerField(read_only=True)
    yield_percent = serializers.FloatField(read_only=True)
    reject_percent = serializers.FloatField(read_only=True)
    actual_rate = serializers.FloatField(read_only=True)
    packing_rate = serializers.FloatField(read_only=True)
    efficiency_percent = serializers.FloatField(read_only=True)

    class Meta:
        model = PackingIntervalRecord
        fields = [
            "id",
            "allocation",
            "schedule_block",
            "from_time",
            "to_time",
            "scheduled_minutes",
            "downtime_minutes",
            "available_minutes",
            "standard_rate_snapshot",
            "planned_output",
            "premium_qty",
            "standard_qty",
            "reject_qty",
            "cleaned_qty",
            "pouches_packed",
            "loose_pieces_packed",
            "pieces_packed",
            "cartons_completed",
            "status",
            "record_type",
            "covers_unrecorded_only",
            "is_final_summary",
            "entered_by",
            "entered_at",
            "is_late_entry",
            "remarks",
            "quality_total",
            "yield_percent",
            "reject_percent",
            "actual_rate",
            "packing_rate",
            "efficiency_percent",
        ]
        read_only_fields = [
            "scheduled_minutes",
            "downtime_minutes",
            "available_minutes",
            "standard_rate_snapshot",
            "planned_output",
            "pieces_packed",
            "status",
            "entered_by",
            "entered_at",
            "is_late_entry",
        ]

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        for field in ("premium_qty", "standard_qty", "reject_qty", "cleaned_qty", "cartons_completed"):
            value = attrs.get(field)
            if value is not None and value < 0:
                raise serializers.ValidationError({field: "Cannot be negative."})
        return attrs


class _SummaryQuantitiesMixin(serializers.Serializer):
    """Shared fields for a single Summary entry — spec v5 §8.3/§8.4, used
    by both the single Record Summary action and each row of a Bulk
    Summary save."""

    is_final_summary = serializers.BooleanField(default=False)
    premium_qty = serializers.IntegerField(min_value=0, default=0)
    standard_qty = serializers.IntegerField(min_value=0, default=0)
    reject_qty = serializers.IntegerField(min_value=0, default=0)
    cleaned_qty = serializers.IntegerField(min_value=0, default=0)
    pouches_packed = serializers.IntegerField(min_value=0, default=0)
    loose_pieces_packed = serializers.IntegerField(min_value=0, default=0)
    cartons_completed = serializers.IntegerField(min_value=0, default=0)
    remarks = serializers.CharField(required=False, allow_blank=True, default="")


class RecordSummarySerializer(_SummaryQuantitiesMixin):
    pass


class SummaryInfoSerializer(serializers.Serializer):
    entered_blocks = serializers.ListField(child=serializers.CharField())
    missing_blocks = serializers.ListField(child=serializers.CharField())


class BulkSummaryRowInputSerializer(_SummaryQuantitiesMixin):
    allocation = serializers.IntegerField()


class BulkSummaryRowSerializer(serializers.Serializer):
    """One row of the Bulk Summary Entry table (spec v5 §8.4) — a Work
    Centre currently holding this Job, with enough context to decide what
    to type without opening the individual Record Summary modal.
    """

    allocation = serializers.IntegerField(source="id")
    work_centre_code = serializers.CharField(source="session.work_centre.code")
    operators = serializers.SerializerMethodField()
    assigned_qty = serializers.IntegerField()
    mode = serializers.SerializerMethodField()

    def get_operators(self, obj: Any) -> str:
        return " + ".join(o.employee.full_name for o in obj.session.operators.all())

    def get_mode(self, obj: Any) -> str:
        has_interval = any(
            r.record_type == PackingIntervalRecord.RecordType.INTERVAL for r in obj.interval_records.all()
        )
        return "MIXED" if has_interval else "SUMMARY"


class WorkCentreIssueEventSerializer(serializers.ModelSerializer):
    is_open = serializers.BooleanField(read_only=True)

    class Meta:
        model = WorkCentreIssueEvent
        fields = [
            "id",
            "session",
            "allocation",
            "issue_type",
            "description",
            "stops_productive_time",
            "started_at",
            "resolved_at",
            "reported_by",
            "resolved_by",
            "is_open",
        ]
        read_only_fields = ["started_at", "resolved_at", "reported_by", "resolved_by"]

    def create(self, validated_data: dict[str, Any]) -> WorkCentreIssueEvent:
        request = self.context["request"]
        session = validated_data["session"]
        return WorkCentreIssueEvent.objects.create(
            organization=session.organization,
            started_at=timezone.now(),
            reported_by=request.user,
            **validated_data,
        )


class PackingWorkCentreSessionOperatorSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source="employee.full_name", read_only=True)

    class Meta:
        model = PackingWorkCentreSessionOperator
        fields = ["id", "employee", "employee_name"]


class PackingWorkCentreAllocationSerializer(serializers.ModelSerializer):
    job_number = serializers.CharField(source="job.job_number", read_only=True)
    order_no = serializers.CharField(
        source="job.plan_line.export_order_line.export_order.order_number", read_only=True
    )
    item_name = serializers.CharField(
        source="job.plan_line.export_order_line.item.name", read_only=True, default=""
    )
    work_centre_code = serializers.CharField(source="session.work_centre.code", read_only=True)
    packed_qty = serializers.IntegerField(read_only=True)
    processed_qty = serializers.IntegerField(read_only=True)
    balance_qty = serializers.IntegerField(read_only=True)
    sequence = serializers.IntegerField(read_only=True)

    class Meta:
        model = PackingWorkCentreAllocation
        fields = [
            "id",
            "session",
            "job",
            "job_number",
            "order_no",
            "item_name",
            "work_centre_code",
            "process_version",
            "sequence",
            "assigned_qty",
            "status",
            "started_at",
            "completed_at",
            "packed_qty",
            "processed_qty",
            "balance_qty",
        ]
        read_only_fields = ["process_version", "status", "started_at", "completed_at"]

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        job = attrs.get("job", getattr(self.instance, "job", None))
        assigned_qty = attrs.get("assigned_qty", getattr(self.instance, "assigned_qty", None))
        if job is not None and assigned_qty is not None:
            already_allocated = job.allocated_qty
            if self.instance is not None:
                already_allocated -= self.instance.assigned_qty
            if already_allocated + assigned_qty > job.target_qty:
                raise serializers.ValidationError(
                    {"assigned_qty": "Total allocations cannot exceed the job's target quantity."}
                )
        return attrs

    def create(self, validated_data: dict[str, Any]) -> PackingWorkCentreAllocation:
        session = validated_data["session"]
        next_sequence = session.allocations.count() + 1
        return PackingWorkCentreAllocation.objects.create(
            organization=session.organization,
            sequence=next_sequence,
            **validated_data,
        )


class PackingWorkCentreSessionSerializer(serializers.ModelSerializer):
    work_centre_code = serializers.CharField(source="work_centre.code", read_only=True)
    work_centre_name = serializers.CharField(source="work_centre.name", read_only=True)
    bay_name = serializers.CharField(source="bay.name", read_only=True)
    date = serializers.DateField(source="packing_shift.date", read_only=True)
    shift_id = serializers.IntegerField(source="packing_shift.shift_id", read_only=True)
    shift_name = serializers.CharField(source="packing_shift.shift.name", read_only=True)
    operators = PackingWorkCentreSessionOperatorSerializer(many=True, read_only=True)
    allocations = PackingWorkCentreAllocationSerializer(many=True, read_only=True)
    current_allocation_id = serializers.SerializerMethodField()
    open_issue = serializers.SerializerMethodField()

    class Meta:
        model = PackingWorkCentreSession
        fields = [
            "id",
            "packing_shift",
            "work_centre",
            "work_centre_code",
            "work_centre_name",
            "bay",
            "bay_name",
            "date",
            "shift_id",
            "shift_name",
            "status",
            "started_at",
            "stopped_at",
            "stop_reason",
            "operators",
            "allocations",
            "current_allocation_id",
            "open_issue",
        ]

    def get_current_allocation_id(self, obj: PackingWorkCentreSession) -> int | None:
        current = obj.current_allocation
        return current.id if current else None

    def get_open_issue(self, obj: PackingWorkCentreSession) -> dict[str, Any] | None:
        issue = obj.issue_events.filter(resolved_at__isnull=True).order_by("-started_at").first()
        if issue is None:
            return None
        return {
            "id": issue.id,
            "issue_type": issue.issue_type,
            "description": issue.description,
            "started_at": issue.started_at,
        }


class PackingShiftSerializer(serializers.ModelSerializer):
    shift_name = serializers.CharField(source="shift.name", read_only=True)
    work_centre_sessions = PackingWorkCentreSessionSerializer(many=True, read_only=True)

    class Meta:
        model = PackingShift
        fields = [
            "id",
            "date",
            "shift",
            "shift_name",
            "status",
            "started_at",
            "stopped_at",
            "work_centre_sessions",
        ]
