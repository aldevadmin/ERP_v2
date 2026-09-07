from typing import Any

from rest_framework import serializers

from apps.accounts.models import Employee
from apps.core.models import Organization
from apps.items.models import Item

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
from .services import MaterialRequirementRow, PackingDemandRow


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
    item_name = serializers.CharField(source="export_order_line.item.name", read_only=True, default="")
    shift_name = serializers.CharField(source="shift.name", read_only=True)
    bay_name = serializers.CharField(source="bay.name", read_only=True)
    has_job = serializers.SerializerMethodField()

    class Meta:
        model = PackingPlanLine
        fields = [
            "id",
            "export_order_line",
            "order_no",
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
        ]

    def get_has_job(self, obj: PackingPlanLine) -> bool:
        return getattr(obj, "packing_job", None) is not None

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
        # Creating a plan line IS the act of planning it — the Plan
        # Packing modal has one action ("Create Plan"), no separate
        # draft-then-confirm step, so it lands directly in PLANNED rather
        # than the model's own DRAFT default (which nothing in this flow
        # would ever otherwise transition out of).
        return PackingPlanLine.objects.create(
            organization=Organization.get_default(),
            status=PackingPlanLine.Status.PLANNED,
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


class PackingAllocationOperatorSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source="employee.full_name", read_only=True)

    class Meta:
        model = PackingAllocationOperator
        fields = ["id", "employee", "employee_name"]


class PackingWorkSessionSerializer(serializers.ModelSerializer):
    from apps.processes.serializers import ProcessExecutionSerializer as _ExecSerializer

    execution_detail = _ExecSerializer(source="execution", read_only=True)

    class Meta:
        model = PackingWorkSession
        fields = [
            "id",
            "allocation",
            "execution",
            "execution_detail",
            "status",
            "started_at",
            "completed_at",
            "remarks",
        ]
        read_only_fields = ["execution"]


class PackingWorkCentreAllocationSerializer(serializers.ModelSerializer):
    work_centre_name = serializers.CharField(source="work_centre.name", read_only=True)
    work_centre_code = serializers.CharField(source="work_centre.code", read_only=True)
    shift_name = serializers.CharField(source="shift.name", read_only=True)
    operators = PackingAllocationOperatorSerializer(many=True, read_only=True)
    operator_ids = serializers.PrimaryKeyRelatedField(
        queryset=Employee.objects.all(), many=True, write_only=True, required=False
    )
    packed_qty = serializers.IntegerField(read_only=True)
    balance_qty = serializers.IntegerField(read_only=True)
    sessions = PackingWorkSessionSerializer(many=True, read_only=True)

    class Meta:
        model = PackingWorkCentreAllocation
        fields = [
            "id",
            "job",
            "work_centre",
            "work_centre_name",
            "work_centre_code",
            "date",
            "shift",
            "shift_name",
            "sequence",
            "assigned_qty",
            "status",
            "operators",
            "operator_ids",
            "packed_qty",
            "balance_qty",
            "sessions",
        ]

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

        work_centre = attrs.get("work_centre", getattr(self.instance, "work_centre", None))
        status = attrs.get("status", getattr(self.instance, "status", None))
        if (
            work_centre is not None
            and status == PackingWorkCentreAllocation.Status.RUNNING
        ):
            conflict = PackingWorkCentreAllocation.objects.filter(
                work_centre=work_centre, status=PackingWorkCentreAllocation.Status.RUNNING
            )
            if self.instance is not None:
                conflict = conflict.exclude(pk=self.instance.pk)
            if conflict.exists():
                raise serializers.ValidationError(
                    {"status": "This Work Centre already has a running allocation."}
                )
        return attrs

    def create(self, validated_data: dict[str, Any]) -> PackingWorkCentreAllocation:
        operator_ids = validated_data.pop("operator_ids", [])
        organization = Organization.get_default()
        allocation = PackingWorkCentreAllocation.objects.create(
            organization=organization, **validated_data
        )
        for employee in operator_ids:
            PackingAllocationOperator.objects.create(
                allocation=allocation, employee=employee, organization=organization
            )
        return allocation

    def update(
        self, instance: PackingWorkCentreAllocation, validated_data: dict[str, Any]
    ) -> PackingWorkCentreAllocation:
        operator_ids = validated_data.pop("operator_ids", None)
        instance = super().update(instance, validated_data)
        if operator_ids is not None:
            instance.operators.all().delete()
            for employee in operator_ids:
                PackingAllocationOperator.objects.create(
                    allocation=instance, employee=employee, organization=instance.organization
                )
        return instance


class PackingJobSerializer(serializers.ModelSerializer):
    order_no = serializers.CharField(
        source="plan_line.export_order_line.export_order.order_number", read_only=True
    )
    customer_name = serializers.CharField(
        source="plan_line.export_order_line.export_order.customer.name", read_only=True
    )
    item_name = serializers.CharField(
        source="plan_line.export_order_line.item.name", read_only=True, default=""
    )
    date = serializers.DateField(source="plan_line.date", read_only=True)
    shift_name = serializers.CharField(source="plan_line.shift.name", read_only=True)
    bay_name = serializers.CharField(source="plan_line.bay.name", read_only=True)
    bay = serializers.IntegerField(source="plan_line.bay_id", read_only=True)
    packed_qty = serializers.IntegerField(read_only=True)
    standard_qty = serializers.IntegerField(read_only=True)
    reject_qty = serializers.IntegerField(read_only=True)
    balance_qty = serializers.IntegerField(read_only=True)
    allocated_qty = serializers.IntegerField(read_only=True)

    class Meta:
        model = PackingJob
        fields = [
            "id",
            "job_number",
            "plan_line",
            "order_no",
            "customer_name",
            "item_name",
            "date",
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
            "remarks",
        ]


class TodaysWorkAllocationSerializer(serializers.Serializer):
    """Flat, purpose-built row for /packing/today — deliberately not the
    full `PackingWorkCentreAllocationSerializer`, since that screen is an
    operational list, not a detail view (spec §3.10: "Show only
    information needed to run today's floor.")."""

    allocation_id = serializers.IntegerField()
    job_id = serializers.IntegerField()
    job_number = serializers.CharField()
    order_no = serializers.CharField()
    item_name = serializers.CharField()
    bay_id = serializers.IntegerField()
    bay_name = serializers.CharField()
    work_centre_id = serializers.IntegerField()
    work_centre_name = serializers.CharField()
    sequence = serializers.IntegerField()
    assigned_qty = serializers.IntegerField()
    packed_qty = serializers.IntegerField()
    status = serializers.CharField()
