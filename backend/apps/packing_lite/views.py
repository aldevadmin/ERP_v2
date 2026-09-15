from typing import Any, cast

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import mixins, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.models import Organization
from apps.export_orders.models import ExportOrderLine
from apps.work_centres.models import WorkCentre

from .models import BoxingRecord, PackingAllotment, PackingDayClosure, PackingLineFlag, WorkCentreRecord
from .permissions import CanManagePacking, IsInternalStaff
from .serializers import (
    BoxingRecordSerializer,
    DayReconciliationRowSerializer,
    PackingAllotmentSerializer,
    PackingLineRowSerializer,
    WorkCentreRecordSerializer,
    WorkCentreRowSerializer,
)
from .services import (
    close_pending_day,
    date_to_close,
    record_boxing_output,
    record_work_centre_output,
    release_drafts,
    remove_draft,
    select_line_for_today,
    set_work_centre_status,
    update_draft_quantity,
)


class PackingLineListView(APIView):
    """Flat, cross-order list of every cartonized Export Order Line, for
    the fresh Packing module's "All Orders" screen — the same underlying
    data as export_orders' own per-order Packing Monitor
    (`apps.export_orders.views.PackingMonitorView`), just not scoped to a
    single order, plus this module's own On Hold flag. Optionally filtered
    to one customer via `?customer=<id>`.
    """

    permission_classes = [IsInternalStaff]

    def get(self, request: Request) -> Response:
        lines = (
            ExportOrderLine.objects.select_related("export_order__customer", "packing_lite_flag")
            .prefetch_related("packing_transactions")
            .order_by("export_order__order_number", "line_number")
        )
        customer_id = request.query_params.get("customer")
        if customer_id:
            lines = lines.filter(export_order__customer_id=customer_id)
        rows = [line for line in lines if line.required_cartons is not None]
        return Response(PackingLineRowSerializer(rows, many=True).data)


class PackingLineHoldView(APIView):
    """Sets or clears the On Hold flag for one line — the one mutation
    this module currently has. Everything else on the All Orders row is
    read-only, derived from `export_orders` data.
    """

    permission_classes = [CanManagePacking]

    def patch(self, request: Request, line_pk: str) -> Response:
        line = get_object_or_404(ExportOrderLine, pk=line_pk)
        data = cast(dict[str, Any], request.data)
        is_on_hold = bool(data.get("is_on_hold"))
        PackingLineFlag.objects.update_or_create(
            export_order_line=line,
            defaults={
                "is_on_hold": is_on_hold,
                "organization": Organization.get_default(),
                "updated_by": cast(Any, request.user),
            },
        )
        line = get_object_or_404(
            ExportOrderLine.objects.select_related("export_order__customer", "packing_lite_flag"),
            pk=line_pk,
        )
        return Response(PackingLineRowSerializer(line).data)


class PackingLineSelectView(APIView):
    """"Select" on All Orders — stages (or reopens) this line's Draft
    allotment. See `services.select_line_for_today` for why a second
    Select on an already-staged line doesn't create a duplicate.
    """

    permission_classes = [CanManagePacking]

    def post(self, request: Request, line_pk: str) -> Response:
        line = get_object_or_404(ExportOrderLine, pk=line_pk)
        allotment = select_line_for_today(line)
        return Response(PackingAllotmentSerializer(allotment).data, status=201)


class PackingAllotmentViewSet(mixins.ListModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    """The "Orders Selected" staging list (`?status=DRAFT`) and Today's
    Work's own list (`?status=RELEASED&date=YYYY-MM-DD`) — same resource,
    read through different filters, so there's one source of truth for
    what "today's plan" actually is.
    """

    serializer_class = PackingAllotmentSerializer
    permission_classes = [CanManagePacking]

    def get_queryset(self) -> Any:
        qs = PackingAllotment.objects.select_related(
            "export_order_line__export_order__customer"
        ).prefetch_related("export_order_line__packing_transactions")
        status_param = self.request.query_params.get("status")
        if status_param:
            qs = qs.filter(status=status_param)
        date_param = self.request.query_params.get("date")
        if date_param:
            qs = qs.filter(date=date_param)
        return qs

    def perform_destroy(self, instance: PackingAllotment) -> None:
        try:
            remove_draft(instance)
        except ValueError as exc:
            raise serializers.ValidationError({"detail": str(exc)}) from exc

    @action(detail=True, methods=["patch"])
    def quantity(self, request: Request, pk: str | None = None) -> Response:
        allotment = self.get_object()
        data = cast(dict[str, Any], request.data)
        try:
            cartons = int(data.get("allotted_cartons", 0))
        except (TypeError, ValueError):
            raise serializers.ValidationError({"detail": "Enter a whole number of cartons."}) from None
        try:
            update_draft_quantity(allotment, cartons=cartons)
        except ValueError as exc:
            raise serializers.ValidationError({"detail": str(exc)}) from exc
        return Response(self.get_serializer(allotment).data)


class ReleaseAllotmentsView(APIView):
    """"Release to Packing Floor" — commits every staged draft at once."""

    permission_classes = [CanManagePacking]

    def post(self, request: Request) -> Response:
        try:
            released = release_drafts(request.user)
        except ValueError as exc:
            raise serializers.ValidationError({"detail": str(exc)}) from exc
        return Response(PackingAllotmentSerializer(released, many=True).data)


class WorkCentreListView(APIView):
    """Every active Work Centre, for the Work Centre section — real
    `work_centres` master data (same source Settings itself reads), not
    anything this module owns.
    """

    permission_classes = [IsInternalStaff]

    def get(self, request: Request) -> Response:
        work_centres = (
            WorkCentre.objects.filter(is_active=True)
            .select_related("packing_lite_status")
            .order_by("code")
        )
        return Response(WorkCentreRowSerializer(work_centres, many=True).data)


class WorkCentreStatusView(APIView):
    """Sets a Work Centre's manual Running/Down flag — see
    `WorkCentreStatus` for why this is independent of `is_active` and of
    everything else this module tracks.
    """

    permission_classes = [CanManagePacking]

    def patch(self, request: Request, work_centre_pk: str) -> Response:
        work_centre = get_object_or_404(WorkCentre, pk=work_centre_pk)
        data = cast(dict[str, Any], request.data)
        try:
            set_work_centre_status(work_centre, status=data.get("status", ""), user=request.user)
        except ValueError as exc:
            raise serializers.ValidationError({"detail": str(exc)}) from exc
        work_centre = get_object_or_404(
            WorkCentre.objects.select_related("packing_lite_status"), pk=work_centre_pk
        )
        return Response(WorkCentreRowSerializer(work_centre).data)


class WorkCentreRecordListView(APIView):
    """GET: today's "Add Records" log, across every Work Centre — the
    running list of what's actually been recorded so far. POST: creates
    one entry (see `services.record_work_centre_output`).
    """

    permission_classes = [CanManagePacking]

    def get(self, request: Request) -> Response:
        records = (
            WorkCentreRecord.objects.filter(execution__date=timezone.localdate())
            .select_related(
                "execution__work_centre",
                "allotment__export_order_line__export_order__customer",
            )
            .order_by("-created_at")
        )
        return Response(WorkCentreRecordSerializer(records, many=True).data)

    def post(self, request: Request) -> Response:
        data = cast(dict[str, Any], request.data)
        allotment = get_object_or_404(PackingAllotment, pk=data.get("allotment"))
        work_centre = get_object_or_404(WorkCentre, pk=data.get("work_centre"))
        try:
            packed_plates = int(data.get("packed_plates", 0))
            pouches_packed = int(data.get("pouches_packed", 0))
            downgraded = int(data.get("downgraded", 0))
            rejected = int(data.get("rejected", 0))
        except (TypeError, ValueError):
            raise serializers.ValidationError({"detail": "Quantities must be whole numbers."}) from None
        employee_ids = data.get("employee_ids") or []
        try:
            record = record_work_centre_output(
                allotment=allotment,
                work_centre=work_centre,
                packed_plates=packed_plates,
                pouches_packed=pouches_packed,
                downgraded=downgraded,
                rejected=rejected,
                employee_ids=employee_ids,
                user=request.user,
            )
        except ValueError as exc:
            raise serializers.ValidationError({"detail": str(exc)}) from exc
        return Response(WorkCentreRecordSerializer(record).data, status=201)


class BoxingRecordListView(APIView):
    """GET: today's "Add Boxing Record" log, across every Work Centre.
    POST: creates one entry (see `services.record_boxing_output`).
    """

    permission_classes = [CanManagePacking]

    def get(self, request: Request) -> Response:
        records = (
            BoxingRecord.objects.filter(execution__date=timezone.localdate())
            .select_related(
                "execution__work_centre",
                "allotment__export_order_line__export_order__customer",
            )
            .prefetch_related("execution__outputs")
            .order_by("-created_at")
        )
        return Response(BoxingRecordSerializer(records, many=True).data)

    def post(self, request: Request) -> Response:
        data = cast(dict[str, Any], request.data)
        allotment = get_object_or_404(PackingAllotment, pk=data.get("allotment"))
        work_centre = get_object_or_404(WorkCentre, pk=data.get("work_centre"))
        try:
            boxes_packed = int(data.get("boxes_packed", 0))
        except (TypeError, ValueError):
            raise serializers.ValidationError({"detail": "Quantity must be a whole number."}) from None
        employee_ids = data.get("employee_ids") or []
        try:
            record = record_boxing_output(
                allotment=allotment,
                work_centre=work_centre,
                boxes_packed=boxes_packed,
                employee_ids=employee_ids,
                user=request.user,
            )
        except ValueError as exc:
            raise serializers.ValidationError({"detail": str(exc)}) from exc
        return Response(BoxingRecordSerializer(record).data, status=201)


class DayReconciliationView(APIView):
    """The Close Today's Work review screen: whichever date is next to
    close (normally today, but an overdue earlier date if one was
    missed — see `services.date_to_close`), whether it's already closed,
    and every Job released on it with Allotted vs. Recorded so the
    Planner sees a shortfall before confirming, not after.
    """

    permission_classes = [CanManagePacking]

    def get(self, request: Request) -> Response:
        target = date_to_close()
        allotments = (
            PackingAllotment.objects.filter(status=PackingAllotment.Status.RELEASED, date=target)
            .select_related("export_order_line__export_order__customer")
            .prefetch_related(
                "work_centre_records__execution__outputs",
                "boxing_records__execution__outputs",
            )
            .order_by("-released_at")
        )
        return Response(
            {
                "date": target,
                "already_closed": PackingDayClosure.objects.filter(date=target).exists(),
                "rows": DayReconciliationRowSerializer(allotments, many=True).data,
            }
        )


class CloseTodayView(APIView):
    """"Close Today's Work" — see `services.close_pending_day`."""

    permission_classes = [CanManagePacking]

    def post(self, request: Request) -> Response:
        try:
            closure = close_pending_day(request.user)
        except ValueError as exc:
            raise serializers.ValidationError({"detail": str(exc)}) from exc
        return Response({"date": closure.date, "closed_at": closure.created_at})
