from typing import cast

from django.db.models import Sum
from django.utils import timezone
from rest_framework import serializers

from apps.export_orders.models import PackingTransaction

from .models import BoxingRecord, PackingAllotment, WorkCentreRecord
from .services import boxing_summary_for_allotment, recorded_plates_for_allotment


def build_job_id(allotment: PackingAllotment) -> str | None:
    """Readable, traceable work-order id — `None` while still a Draft (it
    isn't a real work order until released). Stamped with the release
    time, not the plan date alone, so a line released twice in one day
    gets two distinct ids rather than colliding. Shared by every
    serializer that shows a Job ID (Today's Work, Work Centre records) so
    they can never format it differently.
    """
    if allotment.released_at is None:
        return None
    line = allotment.export_order_line
    stamp = timezone.localtime(allotment.released_at).strftime("%d%m%y-%H%M")
    return f"[{line.export_order.order_number}] [{line.customer_sku_code}] - {stamp}"


class PackingLineRowSerializer(serializers.Serializer):
    """Row shape for the All Orders screen. Serializes `ExportOrderLine`
    instances directly, same approach as
    `apps.export_orders.serializers.PackingMonitorRowSerializer` — every
    quantity here is a live computed property on the line itself (fed by
    `export_orders.PackingTransaction`), never duplicated into this
    module's own storage. `is_on_hold`/`status` are the one thing this
    module adds (see `PackingLineFlag`).
    """

    export_order_line = serializers.IntegerField(source="id")
    customer_id = serializers.IntegerField(source="export_order.customer_id")
    customer_name = serializers.CharField(source="export_order.customer.name")
    order_no = serializers.CharField(source="export_order.order_number")
    customer_sku_code = serializers.CharField()
    required_pieces = serializers.IntegerField()
    required_cartons = serializers.IntegerField()
    packed_cartons = serializers.IntegerField()
    pending_cartons = serializers.SerializerMethodField()
    is_on_hold = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()
    # Shared with Export Orders' own Packing tab — both read/write the same
    # `PackingTransaction` log, so this reflects packing activity from
    # either screen, not just this module's own future recording UI.
    last_updated_at = serializers.DateTimeField(source="last_packing_transaction_at", allow_null=True)

    def get_pending_cartons(self, obj) -> int:
        return max((obj.required_cartons or 0) - obj.packed_cartons, 0)

    def get_is_on_hold(self, obj) -> bool:
        flag = getattr(obj, "packing_lite_flag", None)
        return bool(flag and flag.is_on_hold)

    def get_status(self, obj) -> str:
        if self.get_is_on_hold(obj):
            return "ON_HOLD"
        if obj.packed_cartons <= 0:
            return "BACKLOG"
        if obj.packed_cartons >= (obj.required_cartons or 0):
            return "COMPLETED"
        return "IN_PROGRESS"


class PackingAllotmentSerializer(serializers.ModelSerializer):
    """Row shape for both the "Orders Selected" staging list (`?status=
    DRAFT`) and Today's Work (`?status=RELEASED&date=...`) — same
    resource, read through different filters. `pending_cartons`/
    `packed_today_cartons` are computed the same "derive, don't
    duplicate" way as `PackingLineRowSerializer` — this row never stores
    progress itself.
    """

    customer_name = serializers.CharField(source="export_order_line.export_order.customer.name")
    order_no = serializers.CharField(source="export_order_line.export_order.order_number")
    customer_sku_code = serializers.CharField(source="export_order_line.customer_sku_code")
    pending_cartons = serializers.SerializerMethodField()
    packed_today_cartons = serializers.SerializerMethodField()
    # The rest are Today's Work's own ticket fields — a released allotment
    # read as "how many pieces does this work order actually mean." Snapshot
    # fields straight off the line, same ones `apps.packing`'s Jobs use for
    # this exact conversion, never recomputed differently here.
    job_id = serializers.SerializerMethodField()
    pieces_per_pouch = serializers.IntegerField(
        source="export_order_line.pieces_per_pouch", allow_null=True
    )
    pouches_per_carton = serializers.IntegerField(
        source="export_order_line.pouches_per_carton", allow_null=True
    )
    pieces_per_carton = serializers.IntegerField(
        source="export_order_line.pieces_per_carton", allow_null=True
    )
    total_pieces = serializers.SerializerMethodField()

    class Meta:
        model = PackingAllotment
        fields = [
            "id",
            "export_order_line",
            "customer_name",
            "order_no",
            "customer_sku_code",
            "date",
            "allotted_cartons",
            "status",
            "released_at",
            "pending_cartons",
            "packed_today_cartons",
            "job_id",
            "pieces_per_pouch",
            "pouches_per_carton",
            "pieces_per_carton",
            "total_pieces",
        ]
        read_only_fields = ["date", "status", "released_at"]

    def get_pending_cartons(self, obj: PackingAllotment) -> int:
        return obj.export_order_line.packing_balance or 0

    def get_packed_today_cartons(self, obj: PackingAllotment) -> int:
        return (
            obj.export_order_line.packing_transactions.filter(
                date=obj.date, entry_type=PackingTransaction.EntryType.CARTON_COMPLETED
            ).aggregate(total=Sum("cartons_packed"))["total"]
            or 0
        )

    def get_job_id(self, obj: PackingAllotment) -> str | None:
        return build_job_id(obj)

    def get_total_pieces(self, obj: PackingAllotment) -> int | None:
        pieces_per_carton = obj.export_order_line.pieces_per_carton
        if pieces_per_carton is None:
            return None
        return obj.allotted_cartons * pieces_per_carton


class WorkCentreRowSerializer(serializers.Serializer):
    """Row shape for the Work Centre list — real `work_centres.WorkCentre`
    master data, nothing this module owns. Recording (`Add Records`)
    happens through a modal keyed off `id`/`code`, not tracked as
    persistent state on the row itself. `status` is the one thing this
    module adds (see `WorkCentreStatus`) — a manual Running/Down flag, not
    derived from anything.
    """

    id = serializers.IntegerField()
    code = serializers.CharField()
    name = serializers.CharField()
    is_active = serializers.BooleanField()
    status = serializers.SerializerMethodField()

    def get_status(self, obj) -> str:
        status_flag = getattr(obj, "packing_lite_status", None)
        return status_flag.status if status_flag else "RUNNING"


class WorkCentreRecordSerializer(serializers.ModelSerializer):
    """Row shape for the "recorded today" log — one `Add Records` entry.
    Good/Standard/Scrap read straight off the real `ProcessExecutionOutput`
    rows the entry created (see `services.record_work_centre_output`),
    never re-stored here.
    """

    job_id = serializers.SerializerMethodField()
    work_centre_code = serializers.CharField(source="execution.work_centre.code")
    customer_name = serializers.CharField(source="allotment.export_order_line.export_order.customer.name")
    order_no = serializers.CharField(source="allotment.export_order_line.export_order.order_number")
    customer_sku_code = serializers.CharField(source="allotment.export_order_line.customer_sku_code")
    packed_plates = serializers.SerializerMethodField()
    downgraded = serializers.SerializerMethodField()
    rejected = serializers.SerializerMethodField()
    total_plates = serializers.SerializerMethodField()

    class Meta:
        model = WorkCentreRecord
        fields = [
            "id",
            "job_id",
            "work_centre_code",
            "customer_name",
            "order_no",
            "customer_sku_code",
            "packed_plates",
            "pouches_packed",
            "downgraded",
            "rejected",
            "total_plates",
            "created_at",
        ]

    def get_job_id(self, obj: WorkCentreRecord) -> str | None:
        return build_job_id(obj.allotment)

    def get_packed_plates(self, obj: WorkCentreRecord) -> int:
        return obj.execution.output_quantity_for_classification("Good")

    def get_downgraded(self, obj: WorkCentreRecord) -> int:
        return obj.execution.output_quantity_for_classification("Standard")

    def get_rejected(self, obj: WorkCentreRecord) -> int:
        return obj.execution.output_quantity_for_classification("Scrap")

    def get_total_plates(self, obj: WorkCentreRecord) -> int:
        return obj.execution.total_output_quantity


class BoxingRecordSerializer(serializers.ModelSerializer):
    """Row shape for the "boxed today" log — one `Add Boxing Record`
    entry. `boxes_packed` reads straight off the real `ProcessExecution`
    the entry created (see `services.record_boxing_output`), never
    re-stored here.
    """

    job_id = serializers.SerializerMethodField()
    work_centre_code = serializers.CharField(source="execution.work_centre.code")
    customer_name = serializers.CharField(source="allotment.export_order_line.export_order.customer.name")
    order_no = serializers.CharField(source="allotment.export_order_line.export_order.order_number")
    customer_sku_code = serializers.CharField(source="allotment.export_order_line.customer_sku_code")
    boxes_packed = serializers.SerializerMethodField()

    class Meta:
        model = BoxingRecord
        fields = [
            "id",
            "job_id",
            "work_centre_code",
            "customer_name",
            "order_no",
            "customer_sku_code",
            "boxes_packed",
            "created_at",
        ]

    def get_job_id(self, obj: BoxingRecord) -> str | None:
        return build_job_id(obj.allotment)

    def get_boxes_packed(self, obj: BoxingRecord) -> int:
        return obj.execution.total_output_quantity


class DayReconciliationRowSerializer(serializers.Serializer):
    """Row shape for the Close Today's Work review screen — Allotted vs.
    what's actually been recorded so far, per Job released today. Never
    stored: `recorded_plates` sums live off every `WorkCentreRecord`
    logged against the allotment (see
    `services.recorded_plates_for_allotment`), same "derive, don't
    duplicate" rule as everywhere else in this module.
    """

    id = serializers.IntegerField()
    job_id = serializers.SerializerMethodField()
    customer_name = serializers.CharField(source="export_order_line.export_order.customer.name")
    order_no = serializers.CharField(source="export_order_line.export_order.order_number")
    customer_sku_code = serializers.CharField(source="export_order_line.customer_sku_code")
    allotted_cartons = serializers.IntegerField()
    allotted_plates = serializers.SerializerMethodField()
    recorded_plates = serializers.SerializerMethodField()
    shortfall_plates = serializers.SerializerMethodField()
    # Pouches-vs-boxes reconciliation — a soft warning, see
    # `services.boxing_summary_for_allotment`. Computed once per row and
    # reused across these four fields rather than re-summing four times.
    pouches_packed = serializers.SerializerMethodField()
    boxes_packed = serializers.SerializerMethodField()
    expected_boxes = serializers.SerializerMethodField()
    boxing_discrepancy = serializers.SerializerMethodField()

    def get_job_id(self, obj: PackingAllotment) -> str | None:
        return build_job_id(obj)

    def get_allotted_plates(self, obj: PackingAllotment) -> int | None:
        pieces_per_carton = obj.export_order_line.pieces_per_carton
        if pieces_per_carton is None:
            return None
        return obj.allotted_cartons * pieces_per_carton

    def get_recorded_plates(self, obj: PackingAllotment) -> int:
        return recorded_plates_for_allotment(obj)

    def get_shortfall_plates(self, obj: PackingAllotment) -> int | None:
        allotted = self.get_allotted_plates(obj)
        if allotted is None:
            return None
        return allotted - self.get_recorded_plates(obj)

    def _boxing_summary(self, obj: PackingAllotment) -> dict[str, int | None]:
        cache = getattr(self, "_boxing_summary_cache", None)
        if cache is None:
            cache = {}
            self._boxing_summary_cache = cache
        if obj.id not in cache:
            cache[obj.id] = boxing_summary_for_allotment(obj)
        return cache[obj.id]

    def get_pouches_packed(self, obj: PackingAllotment) -> int:
        return cast(int, self._boxing_summary(obj)["pouches_packed"])

    def get_boxes_packed(self, obj: PackingAllotment) -> int:
        return cast(int, self._boxing_summary(obj)["boxes_packed"])

    def get_expected_boxes(self, obj: PackingAllotment) -> int | None:
        return self._boxing_summary(obj)["expected_boxes"]

    def get_boxing_discrepancy(self, obj: PackingAllotment) -> int | None:
        return self._boxing_summary(obj)["boxing_discrepancy"]
