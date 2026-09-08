from datetime import date as date_cls
from datetime import datetime
from typing import Any, cast

from django.db.models import Q, QuerySet
from django.utils import timezone
from rest_framework import mixins, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import BasePermission
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import Employee
from apps.core.models import Organization
from apps.export_orders.models import ExportOrder, ExportOrderLine
from apps.processes.serializers import ProcessExecutionSerializer
from apps.work_centres.models import WorkCentre

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
from .permissions import CanManagePacking, IsInternalStaff
from .serializers import (
    PackingDemandSerializer,
    PackingExecutionConfigSerializer,
    PackingIntervalRecordSerializer,
    PackingJobSerializer,
    PackingMaterialRequestSerializer,
    PackingMaterialRequirementSerializer,
    PackingPlanLineSerializer,
    PackingShiftSerializer,
    PackingWorkCentreAllocationSerializer,
    PackingWorkCentreSessionSerializer,
    ShiftSerializer,
    WorkCentreIssueEventSerializer,
)
from .services import (
    build_interval_execution_data,
    compute_interval_minutes,
    compute_planned_output,
    get_execution_config,
    get_or_create_job_for_plan_line,
    material_requirements_for_job,
    next_expected_interval,
    packing_demand_row,
    resolve_process_version_for_work_centre,
    start_packing_shift,
    stop_packing_shift,
)


def _parse_aware(value: str) -> datetime:
    """Parses a caller-supplied ISO datetime, localizing it to the current
    timezone if it arrived naive — defensive, since a naive datetime
    compared against `timezone.now()` (used throughout interval/late-entry
    logic) raises rather than just warns.
    """
    parsed = datetime.fromisoformat(value)
    return timezone.make_aware(parsed) if timezone.is_naive(parsed) else parsed


class ShiftViewSet(
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
    stored `PackingDemand` row. Unchanged by the v2 execution revision.
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
    """DELETE only allowed while DRAFT/PLANNED — enforced in
    `perform_destroy`, not the mixin, since `PackingPlanLine` isn't
    PROTECT'd against deletion at the DB level (a `PackingJob` release is
    what should make it immutable from here on). Unchanged by v2.
    """

    queryset = PackingPlanLine.objects.select_related(
        "export_order_line__export_order",
        "export_order_line__export_order__customer",
        "export_order_line__item",
        "shift",
        "bay",
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
            return Response(serializer.data, status=201)
        requests_qs = job.material_requests.prefetch_related("lines__movements", "lines__item")
        return Response(PackingMaterialRequestSerializer(requests_qs, many=True).data)

    @action(detail=True, methods=["get"])
    def allocations(self, request: Request, pk: str | None = None) -> Response:
        """Read-only rollup of every Work Centre Session allocation ever
        assigned against this Job — v2 moves *creating* allocations onto
        Today's Work's "Assign Work" action (a Job now has no Bay/date of
        its own to allocate against; a Work Centre Session does), so this
        tab exists purely to show progress across whichever sessions have
        picked up this job's SKU.
        """
        job = self.get_object()
        allocations = job.allocations.select_related(
            "session__work_centre", "session__packing_shift__shift", "job"
        )
        return Response(PackingWorkCentreAllocationSerializer(allocations, many=True).data)


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
        request. Payload: `{"lines": [{"request_line": id, "date": "...",
        "quantity_issued": n, "quantity_received": n, "remarks": "..."}]}`.
        Supports partial issue/receipt — call again for the remainder.
        Unchanged by v2.
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


class PackingExecutionConfigView(APIView):
    """GET/PATCH the one recording-configuration row for the org — spec v2
    §2.5. Auto-created with documented defaults on first read.
    """

    permission_classes = [CanManagePacking]

    def get(self, request: Request) -> Response:
        config = get_execution_config(Organization.get_default())
        return Response(PackingExecutionConfigSerializer(config).data)

    def patch(self, request: Request) -> Response:
        config = get_execution_config(Organization.get_default())
        serializer = PackingExecutionConfigSerializer(
            config, data=cast(dict[str, Any], request.data), partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save(updated_by=request.user)
        return Response(serializer.data)


class PackingShiftViewSet(
    mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet
):
    queryset = PackingShift.objects.select_related("shift").prefetch_related(
        "work_centre_sessions__work_centre",
        "work_centre_sessions__bay",
        "work_centre_sessions__operators__employee",
        "work_centre_sessions__allocations__job__plan_line__export_order_line__export_order",
        "work_centre_sessions__allocations__job__plan_line__export_order_line__item",
        "work_centre_sessions__issue_events",
    )
    serializer_class = PackingShiftSerializer

    def get_permissions(self) -> list[BasePermission]:
        return [IsInternalStaff()]

    def get_queryset(self) -> QuerySet[PackingShift]:
        queryset = super().get_queryset()
        date_ = self.request.query_params.get("date")
        if date_:
            queryset = queryset.filter(date=date_)
        shift_id = self.request.query_params.get("shift_id")
        if shift_id:
            queryset = queryset.filter(shift_id=shift_id)
        return queryset

    @action(detail=False, methods=["post"], permission_classes=[CanManagePacking])
    def start(self, request: Request) -> Response:
        """Start (or re-confirm) today's shift — spec v2 §2.1. Payload:
        `{"date": "...", "shift": id, "work_centres": [{"work_centre": id,
        "operator_ids": [id, id]}, ...]}`.
        """
        data = cast(dict[str, Any], request.data)
        date_ = data.get("date")
        shift_id = data.get("shift")
        if not date_ or not shift_id:
            raise serializers.ValidationError({"detail": "date and shift are required."})
        shift = Shift.objects.get(id=shift_id)

        entries = []
        seen_employees: set[int] = set()
        for row in data.get("work_centres", []):
            work_centre = WorkCentre.objects.get(id=row["work_centre"])
            operator_ids = row.get("operator_ids", [])
            for employee_id in operator_ids:
                if employee_id in seen_employees:
                    raise serializers.ValidationError(
                        {"detail": "An operator cannot be assigned to two Work Centres in the same shift."}
                    )
                seen_employees.add(employee_id)
            entries.append(
                {
                    "work_centre": work_centre,
                    "operators": Employee.objects.filter(id__in=operator_ids),
                }
            )

        packing_shift = start_packing_shift(
            date_=date_,
            shift=shift,
            organization=Organization.get_default(),
            work_centres=entries,
            user=request.user,
        )
        return Response(PackingShiftSerializer(packing_shift).data, status=201)

    @action(detail=True, methods=["post"], permission_classes=[CanManagePacking])
    def stop(self, request: Request, pk: str | None = None) -> Response:
        packing_shift = self.get_object()
        stop_packing_shift(packing_shift, request.user)
        # `stop_packing_shift` bulk-updates sessions via a queryset
        # `.update()`, which doesn't touch this instance's already-fetched
        # `work_centre_sessions` prefetch cache — re-fetch so the response
        # reflects the real post-stop state rather than a stale one.
        fresh = self.get_queryset().get(pk=packing_shift.pk)
        return Response(self.get_serializer(fresh).data)


class PackingWorkCentreSessionViewSet(
    mixins.RetrieveModelMixin, viewsets.GenericViewSet
):
    queryset = PackingWorkCentreSession.objects.select_related(
        "work_centre", "bay", "packing_shift__shift"
    ).prefetch_related("operators__employee", "allocations__job", "issue_events")
    serializer_class = PackingWorkCentreSessionSerializer

    def get_permissions(self) -> list[BasePermission]:
        return [CanManagePacking()]

    @action(detail=True, methods=["post"])
    def stop(self, request: Request, pk: str | None = None) -> Response:
        session = self.get_object()
        data = cast(dict[str, Any], request.data)
        session.status = PackingWorkCentreSession.Status.STOPPED
        session.stopped_at = timezone.now()
        session.stop_reason = data.get("reason", "")
        session.save(update_fields=["status", "stopped_at", "stop_reason", "updated_at"])
        return Response(self.get_serializer(session).data)

    @action(detail=True, methods=["post"])
    def resume(self, request: Request, pk: str | None = None) -> Response:
        """Closes any open issue event and returns the session to RUNNING
        (if it has a current allocation) or IDLE (if not) — spec v2 §2.8.
        """
        session = self.get_object()
        open_issue = session.issue_events.filter(resolved_at__isnull=True).first()
        if open_issue is not None:
            open_issue.resolved_at = timezone.now()
            open_issue.resolved_by = request.user
            open_issue.save(update_fields=["resolved_at", "resolved_by", "updated_at"])
        session.status = (
            PackingWorkCentreSession.Status.RUNNING
            if session.current_allocation
            else PackingWorkCentreSession.Status.IDLE
        )
        session.save(update_fields=["status", "updated_at"])
        return Response(self.get_serializer(session).data)

    @action(detail=True, methods=["get", "post"])
    def allocations(self, request: Request, pk: str | None = None) -> Response:
        """"Assign Work" (spec v2 §2.2) — queues a Job/SKU onto this
        session. `sequence` is derived server-side from how many
        allocations this session already has.
        """
        session = self.get_object()
        if request.method == "POST":
            data = cast(dict[str, Any], request.data)
            serializer = PackingWorkCentreAllocationSerializer(
                data={**data, "session": session.id}
            )
            serializer.is_valid(raise_exception=True)
            allocation = serializer.save(created_by=request.user, updated_by=request.user)
            job = allocation.job
            if job.status == PackingJob.Status.AWAITING_MATERIAL and job.allocated_qty > 0:
                job.status = PackingJob.Status.READY
                job.save(update_fields=["status"])
            return Response(serializer.data, status=201)
        return Response(
            PackingWorkCentreAllocationSerializer(session.allocations.all(), many=True).data
        )

    @action(detail=True, methods=["get"], url_path="assignable-jobs")
    def assignable_jobs(self, request: Request, pk: str | None = None) -> Response:
        """Candidate Jobs for this session's "Assign Work" modal — scoped
        to this session's own Bay *and* its Date/Shift (a Work Centre
        Session only ever runs one Date/Shift, so a Job planned for a
        different day has nothing to do with what's on the floor right
        now — offering it here just confuses the operator), excluding
        cancelled/completed jobs, with balance still to allocate.
        """
        session = self.get_object()
        candidates = (
            PackingJob.objects.filter(
                plan_line__bay=session.bay,
                plan_line__date=session.packing_shift.date,
                plan_line__shift=session.packing_shift.shift,
            )
            .exclude(status__in=[PackingJob.Status.CANCELLED, PackingJob.Status.COMPLETED])
            .select_related(
                "plan_line__export_order_line__export_order", "plan_line__export_order_line__item"
            )
        )
        jobs = [job for job in candidates if job.target_qty - job.allocated_qty > 0]
        return Response(PackingJobSerializer(jobs, many=True).data)


class PackingWorkCentreAllocationViewSet(
    mixins.RetrieveModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet
):
    queryset = PackingWorkCentreAllocation.objects.select_related(
        "session__work_centre", "session__packing_shift__shift", "job"
    )
    serializer_class = PackingWorkCentreAllocationSerializer

    def get_permissions(self) -> list[BasePermission]:
        return [CanManagePacking()]

    def perform_update(self, serializer: serializers.BaseSerializer) -> None:
        serializer.save(updated_by=self.request.user)

    @action(detail=True, methods=["post"])
    def start(self, request: Request, pk: str | None = None) -> Response:
        """Starts this queued SKU on its session — spec v2 §1.3: only one
        allocation may be RUNNING per session at a time. Resolves and
        pins the process the first time an allocation on this Work Centre
        starts.
        """
        allocation = self.get_object()
        if allocation.status not in (
            PackingWorkCentreAllocation.Status.PLANNED,
            PackingWorkCentreAllocation.Status.READY,
        ):
            raise serializers.ValidationError({"detail": "This allocation cannot be started."})
        session = allocation.session
        if session.current_allocation is not None:
            raise serializers.ValidationError(
                {"detail": "This Work Centre already has a running allocation."}
            )
        if allocation.process_version is None:
            process_version = resolve_process_version_for_work_centre(session.work_centre)
            if process_version is None:
                raise serializers.ValidationError(
                    {"detail": "No process is mapped to this Work Centre's capabilities."}
                )
            allocation.process_version = process_version
        allocation.status = PackingWorkCentreAllocation.Status.RUNNING
        allocation.started_at = timezone.now()
        allocation.save(update_fields=["process_version", "status", "started_at", "updated_at"])

        if session.status != PackingWorkCentreSession.Status.ISSUE:
            session.status = PackingWorkCentreSession.Status.RUNNING
            session.save(update_fields=["status", "updated_at"])
        return Response(self.get_serializer(allocation).data)

    @action(detail=True, methods=["post"])
    def complete(self, request: Request, pk: str | None = None) -> Response:
        """"Complete Current SKU" — spec v2 §2.7. Does NOT stop the Work
        Centre session; it returns to IDLE (unless already in ISSUE) until
        the next allocation is explicitly started.
        """
        allocation = self.get_object()
        if allocation.status != PackingWorkCentreAllocation.Status.RUNNING:
            raise serializers.ValidationError({"detail": "Only a running allocation can be completed."})
        allocation.status = PackingWorkCentreAllocation.Status.COMPLETED
        allocation.completed_at = timezone.now()
        allocation.save(update_fields=["status", "completed_at", "updated_at"])

        session = allocation.session
        if session.status != PackingWorkCentreSession.Status.ISSUE:
            session.status = PackingWorkCentreSession.Status.IDLE
            session.save(update_fields=["status", "updated_at"])

        job = allocation.job
        if job.balance_qty <= 0:
            job.status = PackingJob.Status.COMPLETED
            job.save(update_fields=["status"])
        elif job.status == PackingJob.Status.READY:
            job.status = PackingJob.Status.IN_PROGRESS
            job.save(update_fields=["status"])
        return Response(self.get_serializer(allocation).data)

    @action(detail=True, methods=["get"], url_path="next-interval")
    def next_interval(self, request: Request, pk: str | None = None) -> Response:
        """The interval window Record Hour should open with — spec v2
        §2.4: "auto-select the expected open interval.\""""
        allocation = self.get_object()
        config = get_execution_config(allocation.organization)
        start, end = next_expected_interval(allocation, config)
        return Response({"from_time": start, "to_time": end, "default_interval_minutes": config.default_interval_minutes})

    @action(detail=True, methods=["get", "post"], url_path="interval-records")
    def interval_records(self, request: Request, pk: str | None = None) -> Response:
        """Record Hour — spec v2 §2.4. `from_time`/`to_time` may be
        omitted to use the auto-selected expected interval. Missing
        intervals are allowed (never blocking); a record entered after the
        configured grace period is flagged `is_late_entry`.
        """
        allocation = self.get_object()
        if request.method == "GET":
            records = allocation.interval_records.all()
            return Response(PackingIntervalRecordSerializer(records, many=True).data)

        data = cast(dict[str, Any], request.data)
        config = get_execution_config(allocation.organization)

        if data.get("from_time") and data.get("to_time"):
            from_time = _parse_aware(data["from_time"])
            to_time = _parse_aware(data["to_time"])
        else:
            from_time, to_time = next_expected_interval(allocation, config)

        session = allocation.session
        scheduled, downtime, available = compute_interval_minutes(session, from_time, to_time)

        capability = session.work_centre.capabilities.filter(
            process_definition=allocation.process_version.process_definition
        ).first() if allocation.process_version else None
        standard_rate = capability.standard_rate if capability else None
        planned_output = compute_planned_output(config, standard_rate, available)

        premium_qty = int(data.get("premium_qty", 0))
        standard_qty = int(data.get("standard_qty", 0))
        reject_qty = int(data.get("reject_qty", 0))
        pouches_packed = int(data.get("pouches_packed", 0))
        loose_pieces_packed = int(data.get("loose_pieces_packed", 0))
        pieces_per_pouch = allocation.job.pieces_per_pouch or 0
        pieces_packed = pouches_packed * pieces_per_pouch + loose_pieces_packed

        is_late = False
        if config.allow_late_entry:
            grace = config.missing_record_warning_minutes
            is_late = (timezone.now() - to_time).total_seconds() / 60 > grace
        elif (timezone.now() - to_time).total_seconds() < 0:
            raise serializers.ValidationError({"detail": "Late entry is not allowed for this organization."})

        execution_data = build_interval_execution_data(
            allocation,
            from_time=from_time,
            premium_qty=premium_qty,
            standard_qty=standard_qty,
            reject_qty=reject_qty,
        )
        exec_serializer = ProcessExecutionSerializer(data=execution_data)
        exec_serializer.is_valid(raise_exception=True)
        execution = exec_serializer.save(created_by=request.user, updated_by=request.user)

        record = PackingIntervalRecord.objects.create(
            allocation=allocation,
            from_time=from_time,
            to_time=to_time,
            scheduled_minutes=scheduled,
            downtime_minutes=downtime,
            available_minutes=available,
            standard_rate_snapshot=standard_rate,
            planned_output=planned_output,
            premium_qty=premium_qty,
            standard_qty=standard_qty,
            reject_qty=reject_qty,
            cleaned_qty=int(data.get("cleaned_qty", 0)),
            pouches_packed=pouches_packed,
            loose_pieces_packed=loose_pieces_packed,
            pieces_packed=pieces_packed,
            cartons_completed=int(data.get("cartons_completed", 0)),
            status=PackingIntervalRecord.Status.LATE_ENTRY if is_late else PackingIntervalRecord.Status.ENTERED,
            entered_by=cast(Any, request.user),
            entered_at=timezone.now(),
            is_late_entry=is_late,
            remarks=data.get("remarks", ""),
            execution=execution,
            organization=allocation.organization,
            created_by=cast(Any, request.user),
            updated_by=cast(Any, request.user),
        )
        return Response(PackingIntervalRecordSerializer(record).data, status=201)


class PackingIntervalRecordViewSet(
    mixins.RetrieveModelMixin, viewsets.GenericViewSet
):
    """Retrieve-only here — corrections go through `correct`, keeping the
    audit trail explicit rather than allowing a silent PATCH over an
    entered record (spec v2 §4.1: "Completed/final interval records are
    immutable except through correction with audit trail.").
    """

    queryset = PackingIntervalRecord.objects.select_related("allocation")
    serializer_class = PackingIntervalRecordSerializer

    def get_permissions(self) -> list[BasePermission]:
        return [CanManagePacking()]

    @action(detail=True, methods=["post"])
    def correct(self, request: Request, pk: str | None = None) -> Response:
        record = self.get_object()
        data = cast(dict[str, Any], request.data)
        for field in (
            "premium_qty",
            "standard_qty",
            "reject_qty",
            "cleaned_qty",
            "pouches_packed",
            "loose_pieces_packed",
            "cartons_completed",
            "remarks",
        ):
            if field in data:
                setattr(record, field, data[field])
        record.pieces_packed = record.pouches_packed * (record.allocation.job.pieces_per_pouch or 0) + record.loose_pieces_packed
        record.status = PackingIntervalRecord.Status.CORRECTED
        record.save()

        if record.execution_id:
            exec_serializer = ProcessExecutionSerializer(
                record.execution,
                data=build_interval_execution_data(
                    record.allocation,
                    from_time=record.from_time,
                    premium_qty=record.premium_qty,
                    standard_qty=record.standard_qty,
                    reject_qty=record.reject_qty,
                ),
                partial=True,
            )
            exec_serializer.is_valid(raise_exception=True)
            exec_serializer.save(updated_by=request.user)
        return Response(self.get_serializer(record).data)


class WorkCentreIssueEventViewSet(
    mixins.CreateModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet
):
    queryset = WorkCentreIssueEvent.objects.select_related("session")
    serializer_class = WorkCentreIssueEventSerializer

    def get_permissions(self) -> list[BasePermission]:
        return [CanManagePacking()]

    def perform_create(self, serializer: serializers.BaseSerializer) -> None:
        issue = serializer.save()
        if issue.stops_productive_time:
            session = issue.session
            session.status = PackingWorkCentreSession.Status.ISSUE
            session.save(update_fields=["status", "updated_at"])

    @action(detail=True, methods=["post"])
    def resolve(self, request: Request, pk: str | None = None) -> Response:
        issue = self.get_object()
        issue.resolved_at = timezone.now()
        issue.resolved_by = request.user
        issue.save(update_fields=["resolved_at", "resolved_by", "updated_at"])

        session = issue.session
        if not session.issue_events.filter(resolved_at__isnull=True).exists():
            session.status = (
                PackingWorkCentreSession.Status.RUNNING
                if session.current_allocation
                else PackingWorkCentreSession.Status.IDLE
            )
            session.save(update_fields=["status", "updated_at"])
        return Response(self.get_serializer(issue).data)


class TodaysShiftView(APIView):
    """GET /packing-today/?date=&shift_id= — spec v2 §2.2, the Live Shift
    Control Board's data source. Returns the `PackingShift` for that
    date+shift with its Work Centre Sessions nested (or `null` if the
    shift hasn't been set up/started yet, in which case the frontend shows
    the Shift Setup screen instead).
    """

    permission_classes = [IsInternalStaff]

    def get(self, request: Request) -> Response:
        date_ = request.query_params.get("date") or date_cls.today().isoformat()
        shift_id = request.query_params.get("shift_id")
        if not shift_id:
            raise serializers.ValidationError({"detail": "shift_id is required."})

        packing_shift = (
            PackingShift.objects.filter(date=date_, shift_id=shift_id)
            .select_related("shift")
            .prefetch_related(
                "work_centre_sessions__work_centre",
                "work_centre_sessions__bay",
                "work_centre_sessions__operators__employee",
                "work_centre_sessions__allocations__job__plan_line__export_order_line__export_order",
                "work_centre_sessions__allocations__job__plan_line__export_order_line__item",
                "work_centre_sessions__issue_events",
            )
            .first()
        )
        if packing_shift is None:
            return Response({"shift": None})
        return Response({"shift": PackingShiftSerializer(packing_shift).data})
