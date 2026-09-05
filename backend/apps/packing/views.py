from datetime import date as date_cls
from typing import Any, cast

from django.db.models import Q, QuerySet
from django.utils import timezone
from rest_framework import mixins, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import BasePermission
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.mixins import ProtectedDestroyMixin
from apps.export_orders.models import ExportOrder, ExportOrderLine
from apps.processes.serializers import ProcessExecutionSerializer

from .models import (
    PackingJob,
    PackingMaterialMovement,
    PackingMaterialRequest,
    PackingMaterialRequestLine,
    PackingPlanLine,
    PackingWorkCentreAllocation,
    PackingWorkSession,
    Shift,
)
from .permissions import CanManagePacking, IsInternalStaff
from .serializers import (
    PackingDemandSerializer,
    PackingJobSerializer,
    PackingMaterialRequestSerializer,
    PackingMaterialRequirementSerializer,
    PackingPlanLineSerializer,
    PackingWorkCentreAllocationSerializer,
    PackingWorkSessionSerializer,
    ShiftSerializer,
    TodaysWorkAllocationSerializer,
)
from .services import auto_allocate_equal, get_or_create_job_for_plan_line, material_requirements_for_job, packing_demand_row


class ShiftViewSet(
    ProtectedDestroyMixin,
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    queryset = Shift.objects.all()
    serializer_class = ShiftSerializer

    def get_permissions(self) -> list[BasePermission]:
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [CanManagePacking()]
        return [IsInternalStaff()]

    def get_queryset(self) -> QuerySet[Shift]:
        queryset = super().get_queryset()
        is_active = self.request.query_params.get("is_active")
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() in ("true", "1"))
        return queryset


class PackingOrdersView(APIView):
    """GET /packing-orders/ — Phase 1's Packing Demand read model. One row
    per `ExportOrderLine` with an `item` set, computed live, never a
    stored `PackingDemand` row (see spec §Phase 1 rule 4).
    """

    permission_classes = [IsInternalStaff]

    def get(self, request: Request) -> Response:
        params = request.query_params
        lines = (
            ExportOrderLine.objects.filter(item__isnull=False)
            .exclude(
                export_order__status__in=[ExportOrder.Status.CANCELLED, ExportOrder.Status.COMPLETE]
            )
            .select_related("export_order", "export_order__customer", "item")
            .prefetch_related("packing_transactions", "packing_plan_lines")
        )

        search = params.get("search")
        if search:
            lines = lines.filter(
                Q(export_order__order_number__icontains=search)
                | Q(item__name__icontains=search)
                | Q(item__code__icontains=search)
                | Q(customer_sku_code__icontains=search)
            )
        customer_id = params.get("customer_id")
        if customer_id:
            lines = lines.filter(export_order__customer_id=customer_id)
        due_from = params.get("due_from")
        if due_from:
            lines = lines.filter(export_order__requested_shipment_date__gte=due_from)
        due_to = params.get("due_to")
        if due_to:
            lines = lines.filter(export_order__requested_shipment_date__lte=due_to)

        rows = [packing_demand_row(line) for line in lines]

        status_filter = params.get("status")
        unplanned_only = params.get("unplanned_only") == "true"
        serializer = PackingDemandSerializer(instance=rows, many=True)
        filtered: list[Any] = list(serializer.data)
        if status_filter:
            filtered = [row for row in filtered if row["status"] == status_filter]
        if unplanned_only:
            filtered = [row for row in filtered if row["unplanned_qty"] > 0]
        return Response({"count": len(filtered), "results": filtered})


class PackingPlanLineViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """DELETE only allowed while DRAFT/PLANNED (spec §4.2) — enforced in
    `perform_destroy`, not the mixin, since `PackingPlanLine` isn't
    PROTECT'd against deletion at the DB level (a `PackingJob` release is
    what should make it immutable from here on)."""

    queryset = PackingPlanLine.objects.select_related(
        "export_order_line__export_order", "export_order_line__item", "shift", "bay"
    ).prefetch_related("packing_job")
    serializer_class = PackingPlanLineSerializer

    def get_permissions(self) -> list[BasePermission]:
        return [CanManagePacking()]

    def get_queryset(self) -> QuerySet[PackingPlanLine]:
        queryset = super().get_queryset()
        week_start = self.request.query_params.get("week_start")
        week_end = self.request.query_params.get("week_end")
        if week_start:
            queryset = queryset.filter(date__gte=week_start)
        if week_end:
            queryset = queryset.filter(date__lte=week_end)
        shift_id = self.request.query_params.get("shift_id")
        if shift_id:
            queryset = queryset.filter(shift_id=shift_id)
        bay_id = self.request.query_params.get("bay_id")
        if bay_id:
            queryset = queryset.filter(bay_id=bay_id)
        return queryset.exclude(status=PackingPlanLine.Status.CANCELLED)

    def perform_create(self, serializer: serializers.BaseSerializer) -> None:
        serializer.save(created_by=self.request.user, updated_by=self.request.user)

    def perform_update(self, serializer: serializers.BaseSerializer) -> None:
        serializer.save(updated_by=self.request.user)

    def perform_destroy(self, instance: PackingPlanLine) -> None:
        if instance.status not in (PackingPlanLine.Status.DRAFT, PackingPlanLine.Status.PLANNED):
            raise serializers.ValidationError(
                {"detail": "Only a Draft or Planned plan line can be deleted — cancel it instead."}
            )
        instance.delete()

    @action(detail=True, methods=["post"])
    def release(self, request: Request, pk: str | None = None) -> Response:
        plan_line = self.get_object()
        plan_line.status = PackingPlanLine.Status.RELEASED
        plan_line.save(update_fields=["status"])
        job = get_or_create_job_for_plan_line(plan_line)
        return Response(PackingJobSerializer(job).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request: Request, pk: str | None = None) -> Response:
        plan_line = self.get_object()
        plan_line.status = PackingPlanLine.Status.CANCELLED
        plan_line.save(update_fields=["status"])
        return Response(self.get_serializer(plan_line).data)

    @action(detail=True, methods=["post"], url_path="create-job")
    def create_job(self, request: Request, pk: str | None = None) -> Response:
        plan_line = self.get_object()
        job = get_or_create_job_for_plan_line(plan_line)
        return Response(PackingJobSerializer(job).data)


class PackingJobViewSet(
    mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet
):
    queryset = PackingJob.objects.select_related(
        "plan_line__export_order_line__export_order__customer",
        "plan_line__export_order_line__item",
        "plan_line__shift",
        "plan_line__bay",
    )
    serializer_class = PackingJobSerializer

    def get_permissions(self) -> list[BasePermission]:
        return [CanManagePacking()]

    def perform_update(self, serializer: serializers.BaseSerializer) -> None:
        serializer.save(updated_by=self.request.user)

    @action(detail=True, methods=["post"])
    def hold(self, request: Request, pk: str | None = None) -> Response:
        job = self.get_object()
        job.status = PackingJob.Status.ON_HOLD
        job.save(update_fields=["status"])
        return Response(self.get_serializer(job).data)

    @action(detail=True, methods=["post"])
    def resume(self, request: Request, pk: str | None = None) -> Response:
        job = self.get_object()
        job.status = PackingJob.Status.IN_PROGRESS
        job.save(update_fields=["status"])
        return Response(self.get_serializer(job).data)

    @action(detail=True, methods=["post"])
    def complete(self, request: Request, pk: str | None = None) -> Response:
        job = self.get_object()
        job.status = PackingJob.Status.COMPLETED
        job.save(update_fields=["status"])
        return Response(self.get_serializer(job).data)

    @action(detail=True, methods=["get"], url_path="material-requirements")
    def material_requirements(self, request: Request, pk: str | None = None) -> Response:
        job = self.get_object()
        rows = material_requirements_for_job(job)
        return Response(PackingMaterialRequirementSerializer(rows, many=True).data)

    @action(detail=True, methods=["get", "post"], url_path="material-requests")
    def material_requests(self, request: Request, pk: str | None = None) -> Response:
        job = self.get_object()
        if request.method == "POST":
            data = cast(dict[str, Any], request.data)
            data = {**data, "job": job.id}
            serializer = PackingMaterialRequestSerializer(data=data)
            serializer.is_valid(raise_exception=True)
            serializer.save(created_by=request.user, updated_by=request.user)
            if job.status == PackingJob.Status.AWAITING_MATERIAL:
                pass  # stays AWAITING_MATERIAL until material is actually received
            return Response(serializer.data, status=201)
        requests_qs = job.material_requests.prefetch_related("lines__movements", "lines__item")
        return Response(PackingMaterialRequestSerializer(requests_qs, many=True).data)

    @action(detail=True, methods=["get", "post"])
    def allocations(self, request: Request, pk: str | None = None) -> Response:
        """POST derives `date`/`shift` from the job's own plan line and
        `sequence` from how many allocations this Work Centre already has
        for that date+shift — the caller (the Allocate Work Centre modal)
        only ever needs to supply `work_centre`, `operator_ids`, and
        `assigned_qty`. This is what lets the same Work Centre take a
        second, later-sequenced SKU without the frontend having to track
        sequencing itself.
        """
        job = self.get_object()
        if request.method == "POST":
            data = cast(dict[str, Any], request.data)
            work_centre_id = data.get("work_centre")
            plan_line = job.plan_line
            next_sequence = (
                PackingWorkCentreAllocation.objects.filter(
                    work_centre_id=work_centre_id, date=plan_line.date, shift_id=plan_line.shift_id
                ).count()
                + 1
            )
            data = {
                **data,
                "job": job.id,
                "date": plan_line.date,
                "shift": plan_line.shift_id,
                "sequence": next_sequence,
            }
            serializer = PackingWorkCentreAllocationSerializer(data=data)
            serializer.is_valid(raise_exception=True)
            serializer.save(created_by=request.user, updated_by=request.user)
            self._maybe_mark_ready(job)
            return Response(serializer.data, status=201)
        allocations = job.allocations.select_related("work_centre", "shift").prefetch_related(
            "operators__employee", "sessions"
        )
        return Response(PackingWorkCentreAllocationSerializer(allocations, many=True).data)

    def _maybe_mark_ready(self, job: PackingJob) -> None:
        if job.status == PackingJob.Status.AWAITING_MATERIAL and job.allocated_qty > 0:
            job.status = PackingJob.Status.READY
            job.save(update_fields=["status"])

    @action(detail=True, methods=["post"], url_path="auto-allocation-preview")
    def auto_allocation_preview(self, request: Request, pk: str | None = None) -> Response:
        job = self.get_object()
        data = cast(dict[str, Any], request.data)
        work_centre_ids = data.get("work_centre_ids", [])
        shift_id = data.get("shift_id") or job.plan_line.shift_id
        date_ = data.get("date") or job.plan_line.date
        rows = auto_allocate_equal(job, work_centre_ids, date_, shift_id)
        return Response({"allocations": rows})

    @action(detail=True, methods=["post"], url_path="auto-allocate")
    def auto_allocate(self, request: Request, pk: str | None = None) -> Response:
        job = self.get_object()
        data = cast(dict[str, Any], request.data)
        work_centre_ids = data.get("work_centre_ids", [])
        shift_id = data.get("shift_id") or job.plan_line.shift_id
        date_ = data.get("date") or job.plan_line.date
        rows = auto_allocate_equal(job, work_centre_ids, date_, shift_id)

        created = []
        for index, row in enumerate(rows, start=1):
            existing_max = job.allocations.filter(work_centre_id=row["work_centre"]).count()
            serializer = PackingWorkCentreAllocationSerializer(
                data={**row, "job": job.id, "sequence": existing_max + 1}
            )
            serializer.is_valid(raise_exception=True)
            serializer.save(created_by=request.user, updated_by=request.user)
            created.append(serializer.data)
        self._maybe_mark_ready(job)
        return Response({"allocations": created}, status=201)


class PackingMaterialRequestViewSet(
    mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet
):
    queryset = PackingMaterialRequest.objects.prefetch_related("lines__movements", "lines__item")
    serializer_class = PackingMaterialRequestSerializer

    def get_permissions(self) -> list[BasePermission]:
        return [CanManagePacking()]

    @action(detail=True, methods=["post"])
    def receive(self, request: Request, pk: str | None = None) -> Response:
        """One warehouse hand-off against one or more lines of this
        request — spec §4.4 `POST /material-requests/{id}/receive`.
        Payload: `{"lines": [{"request_line": id, "date": "...",
        "quantity_issued": n, "quantity_received": n, "remarks": "..."}]}`.
        Supports partial issue/receipt — call again for the remainder.
        """
        material_request = self.get_object()
        data = cast(dict[str, Any], request.data)
        rows = data.get("lines", [])
        organization = material_request.organization
        for row in rows:
            line = PackingMaterialRequestLine.objects.get(
                id=row["request_line"], request=material_request
            )
            PackingMaterialMovement.objects.create(
                request_line=line,
                date=row.get("date") or timezone.now().date(),
                quantity_issued=row.get("quantity_issued", 0),
                quantity_received=row.get("quantity_received", 0),
                remarks=row.get("remarks", ""),
                organization=organization,
                created_by=cast(Any, request.user),
                updated_by=cast(Any, request.user),
            )

        job = material_request.job
        all_received = all(
            line.status == PackingMaterialRequestLine.Status.RECEIVED
            for line in material_request.lines.all()
        )
        if all_received and job.status == PackingJob.Status.AWAITING_MATERIAL:
            job.status = PackingJob.Status.READY
            job.save(update_fields=["status"])

        material_request.refresh_from_db()
        return Response(self.get_serializer(material_request).data)


class PackingWorkCentreAllocationViewSet(
    mixins.RetrieveModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet
):
    queryset = PackingWorkCentreAllocation.objects.select_related("work_centre", "shift", "job")
    serializer_class = PackingWorkCentreAllocationSerializer

    def get_permissions(self) -> list[BasePermission]:
        return [CanManagePacking()]

    def perform_update(self, serializer: serializers.BaseSerializer) -> None:
        serializer.save(updated_by=self.request.user)

    @action(detail=True, methods=["post"], url_path="start-session")
    def start_session(self, request: Request, pk: str | None = None) -> Response:
        allocation = self.get_object()
        if allocation.sessions.filter(status=PackingWorkSession.Status.RUNNING).exists():
            raise serializers.ValidationError({"detail": "This allocation already has a running session."})
        active_conflict = (
            PackingWorkCentreAllocation.objects.filter(
                work_centre=allocation.work_centre, status=PackingWorkCentreAllocation.Status.RUNNING
            )
            .exclude(pk=allocation.pk)
            .exists()
        )
        if active_conflict:
            raise serializers.ValidationError(
                {"detail": "This Work Centre already has a different running allocation."}
            )
        session = PackingWorkSession.objects.create(
            allocation=allocation,
            status=PackingWorkSession.Status.RUNNING,
            started_at=timezone.now(),
            organization=allocation.organization,
            created_by=cast(Any, request.user),
            updated_by=cast(Any, request.user),
        )
        allocation.status = PackingWorkCentreAllocation.Status.RUNNING
        allocation.save(update_fields=["status"])
        return Response(PackingWorkSessionSerializer(session).data, status=201)

    @action(detail=False, methods=["get"])
    def queue(self, request: Request) -> Response:
        """GET /packing-allocations/queue/?work_centre=&date=&shift_id= —
        spec §4.5's `/work-centres/{id}/queue`, exposed here since this
        ViewSet already owns allocation querying. Ordered by sequence;
        only one may be current/running at a time (spec §3.11)."""
        work_centre_id = request.query_params.get("work_centre")
        date_ = request.query_params.get("date")
        shift_id = request.query_params.get("shift_id")
        if not (work_centre_id and date_ and shift_id):
            raise serializers.ValidationError(
                {"detail": "work_centre, date, and shift_id are all required."}
            )
        allocations = PackingWorkCentreAllocation.objects.filter(
            work_centre_id=int(work_centre_id), date=date_, shift_id=int(shift_id)
        ).exclude(status=PackingWorkCentreAllocation.Status.CANCELLED).select_related(
            "job__plan_line__export_order_line__item", "job__plan_line__export_order_line__export_order"
        ).order_by("sequence")
        return Response(PackingWorkCentreAllocationSerializer(allocations, many=True).data)


class PackingWorkSessionViewSet(
    mixins.RetrieveModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet
):
    queryset = PackingWorkSession.objects.select_related("allocation", "execution")
    serializer_class = PackingWorkSessionSerializer

    def get_permissions(self) -> list[BasePermission]:
        return [CanManagePacking()]

    def perform_update(self, serializer: serializers.BaseSerializer) -> None:
        serializer.save(updated_by=self.request.user)

    @action(detail=True, methods=["post"])
    def complete(self, request: Request, pk: str | None = None) -> Response:
        """Atomically: persist the `ProcessExecution` (Sorting/Cleaning/
        Packing quantities), close the session, and update the
        allocation's/job's progress — spec §Phase 8 rule 5. The nested
        `ProcessExecutionSerializer` payload's `inputs_write` is expected
        to already carry the "Picked up" quantity computed by the caller
        (see spec's "Picked up is auto-filled" decision) — this view does
        not compute it itself so the generic engine stays untouched.
        """
        session = self.get_object()
        if session.status == PackingWorkSession.Status.COMPLETED:
            raise serializers.ValidationError({"detail": "This session is already completed."})

        data = cast(dict[str, Any], request.data)
        execution_data = dict(data.get("execution", {}))
        execution_data.setdefault("work_centre", session.allocation.work_centre_id)
        execution_data.setdefault("date", session.allocation.date)
        execution_data.setdefault(
            "export_order_line",
            session.allocation.job.plan_line.export_order_line_id,
        )

        if session.execution_id:
            exec_serializer = ProcessExecutionSerializer(
                session.execution, data=execution_data, partial=True
            )
        else:
            exec_serializer = ProcessExecutionSerializer(data=execution_data)
        exec_serializer.is_valid(raise_exception=True)
        execution = exec_serializer.save(
            created_by=request.user, updated_by=request.user
        )

        session.execution = execution
        session.status = PackingWorkSession.Status.COMPLETED
        session.completed_at = timezone.now()
        session.remarks = data.get("remarks", session.remarks)
        session.save(update_fields=["execution", "status", "completed_at", "remarks", "updated_at"])

        allocation = session.allocation
        if allocation.balance_qty <= 0:
            allocation.status = PackingWorkCentreAllocation.Status.COMPLETED
            allocation.save(update_fields=["status"])
            next_allocation = (
                PackingWorkCentreAllocation.objects.filter(
                    work_centre=allocation.work_centre,
                    date=allocation.date,
                    shift=allocation.shift,
                    sequence=allocation.sequence + 1,
                )
                .exclude(status=PackingWorkCentreAllocation.Status.CANCELLED)
                .first()
            )
            if next_allocation and next_allocation.status == PackingWorkCentreAllocation.Status.PLANNED:
                next_allocation.status = PackingWorkCentreAllocation.Status.READY
                next_allocation.save(update_fields=["status"])

        job = allocation.job
        if job.balance_qty <= 0:
            job.status = PackingJob.Status.COMPLETED
            job.save(update_fields=["status"])
        elif job.status == PackingJob.Status.READY:
            job.status = PackingJob.Status.IN_PROGRESS
            job.save(update_fields=["status"])

        return Response(PackingWorkSessionSerializer(session).data)


class TodaysWorkView(APIView):
    """GET /packing/today/?date=&shift_id= — spec §3.10/Phase 7. An
    operational list, not a dashboard: only the running/ready allocations
    for the given date+shift, grouped implicitly by Bay via `bay_name`.
    """

    permission_classes = [IsInternalStaff]

    def get(self, request: Request) -> Response:
        date_ = request.query_params.get("date") or date_cls.today().isoformat()
        shift_id = request.query_params.get("shift_id")

        allocations = (
            PackingWorkCentreAllocation.objects.filter(date=date_)
            .exclude(status=PackingWorkCentreAllocation.Status.CANCELLED)
            .select_related(
                "work_centre",
                "job__plan_line__bay",
                "job__plan_line__export_order_line__export_order",
                "job__plan_line__export_order_line__item",
            )
            .order_by("job__plan_line__bay__name", "work_centre__name", "sequence")
        )
        if shift_id:
            allocations = allocations.filter(shift_id=shift_id)

        rows = []
        for allocation in allocations:
            job = allocation.job
            line = job.plan_line.export_order_line
            rows.append(
                {
                    "allocation_id": allocation.id,
                    "job_id": job.id,
                    "job_number": job.job_number,
                    "order_no": line.export_order.order_number,
                    "item_name": line.item.name if line.item else "",
                    "bay_id": job.plan_line.bay_id,
                    "bay_name": job.plan_line.bay.name,
                    "work_centre_id": allocation.work_centre_id,
                    "work_centre_name": allocation.work_centre.name,
                    "sequence": allocation.sequence,
                    "assigned_qty": allocation.assigned_qty,
                    "packed_qty": allocation.packed_qty,
                    "status": allocation.status,
                }
            )
        serializer = TodaysWorkAllocationSerializer(rows, many=True)
        return Response({"results": serializer.data})
