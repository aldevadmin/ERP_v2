from typing import Any, cast

from django.db.models import QuerySet
from django.shortcuts import get_object_or_404
from rest_framework import filters, mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import BasePermission
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.serializers import BaseSerializer
from rest_framework.views import APIView

from .models import (
    ExportOrder,
    ExportOrderLine,
    ExportOrderNote,
    ExportOrderPOVersion,
    ExportOrderStageEvent,
    LoadingTransaction,
    PackingMaterialRequirement,
    PackingTransaction,
    ProcurementRequirement,
    ProcurementTransaction,
    ProductionRequirement,
    ProductionTransaction,
    Shipment,
    ShipmentLine,
    SKUSupplyPlan,
)
from .permissions import (
    CanManageExportOrders,
    CanManagePacking,
    CanManageProcurement,
    CanManageProduction,
    CanManageShipments,
    IsInternalStaff,
)
from .serializers import (
    ExportOrderLineSerializer,
    ExportOrderListSerializer,
    ExportOrderNoteSerializer,
    ExportOrderPOVersionSerializer,
    ExportOrderSerializer,
    FulfilmentTransactionSerializer,
    LoadingTransactionLogSerializer,
    LoadingTransactionSerializer,
    PackingMaterialRequirementSerializer,
    PackingMaterialRequirementSummarySerializer,
    PackingMonitorRowSerializer,
    PackingTransactionLogSerializer,
    PackingTransactionSerializer,
    ProcurementRequirementSummarySerializer,
    ProcurementTransactionSerializer,
    ProductionRequirementSummarySerializer,
    ProductionTransactionSerializer,
    ShipmentLineSerializer,
    ShipmentSerializer,
    SKUSupplyPlanSerializer,
    SKUSupplyPlanSummarySerializer,
)


class ExportOrderViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """No delete route — "Cancelled" status is the equivalent of
    deactivation for a transactional record like this.
    """

    queryset = ExportOrder.objects.select_related(
        "customer", "export_coordinator", "bill_to", "ship_to"
    )
    filter_backends = [filters.SearchFilter]
    search_fields = ["order_number", "customer_po_number", "customer__name"]

    def get_serializer_class(self) -> type[BaseSerializer]:
        if self.action == "list":
            return ExportOrderListSerializer
        return ExportOrderSerializer

    def get_permissions(self) -> list[BasePermission]:
        if self.action in ("create", "update", "partial_update", "cancel", "advance"):
            return [CanManageExportOrders()]
        return [IsInternalStaff()]

    def get_queryset(self) -> QuerySet[ExportOrder]:
        queryset = super().get_queryset()

        if self.action in ("list", "retrieve"):
            queryset = queryset.prefetch_related("shipments")
        if self.action == "retrieve":
            queryset = queryset.prefetch_related("stage_events")

        order_status = self.request.query_params.get("status")
        if order_status:
            queryset = queryset.filter(status=order_status)

        customer_id = self.request.query_params.get("customer")
        if customer_id:
            queryset = queryset.filter(customer_id=customer_id)

        crd_from = self.request.query_params.get("crd_from")
        if crd_from:
            queryset = queryset.filter(planned_container_ready_date__gte=crd_from)

        crd_to = self.request.query_params.get("crd_to")
        if crd_to:
            queryset = queryset.filter(planned_container_ready_date__lte=crd_to)

        return queryset

    def perform_create(self, serializer: BaseSerializer) -> None:
        serializer.save(created_by=self.request.user, updated_by=self.request.user)

    def perform_update(self, serializer: BaseSerializer) -> None:
        serializer.save(updated_by=self.request.user)

    @action(detail=True, methods=["post"])
    def cancel(self, request: Request, pk: str | None = None) -> Response:
        order = self.get_object()
        if order.status == ExportOrder.Status.CANCELLED:
            return Response(
                {"detail": "This order is already cancelled."}, status=status.HTTP_400_BAD_REQUEST
            )
        order.status = ExportOrder.Status.CANCELLED
        order.updated_by = request.user
        order.save(update_fields=["status", "updated_by", "updated_at"])
        return Response(ExportOrderSerializer(order).data)

    @action(detail=True, methods=["post"])
    def advance(self, request: Request, pk: str | None = None) -> Response:
        """Move the order to the next stage in `ExportOrder.STAGE_SEQUENCE`
        and log an `ExportOrderStageEvent` — manual, coordinator-driven
        (there's no auto-detection of "Fulfilment is done" from activity
        in other tabs; see docs/modules/export-orders/business-rules.md).
        """
        order = self.get_object()
        sequence = ExportOrder.STAGE_SEQUENCE
        if order.status not in sequence:
            return Response(
                {"detail": "Cancelled orders can't be advanced."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        current_index = sequence.index(order.status)
        if current_index == len(sequence) - 1:
            return Response(
                {"detail": "This order has already reached its final stage."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        next_status = sequence[current_index + 1]
        order.status = next_status
        order.updated_by = request.user
        order.save(update_fields=["status", "updated_by", "updated_at"])
        ExportOrderStageEvent.objects.create(
            export_order=order, status=next_status, created_by=cast(Any, request.user)
        )
        return Response(ExportOrderSerializer(order).data)


class ExportOrderLineViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """Full CRUD — a coordinator correcting a data-entry mistake deletes
    and re-enters a line, same as `customer_mappings.CustomerProductMappingViewSet`.

    No pagination: a coordinator entering 10-50 lines needs the full set
    in one response for the rapid-entry grid — the global 20-row default
    page size would silently truncate a real order.
    """

    serializer_class = ExportOrderLineSerializer
    pagination_class = None
    lookup_url_kwarg = "line_pk"

    def get_permissions(self) -> list[BasePermission]:
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [CanManageExportOrders()]
        return [IsInternalStaff()]

    def get_export_order(self) -> ExportOrder:
        return get_object_or_404(ExportOrder, pk=self.kwargs["export_order_pk"])

    def get_queryset(self) -> QuerySet[ExportOrderLine]:
        return ExportOrderLine.objects.filter(
            export_order_id=self.kwargs["export_order_pk"]
        ).select_related("item")

    def get_serializer_context(self) -> dict[str, Any]:
        context = dict(super().get_serializer_context())
        context["export_order"] = self.get_export_order()
        return context

    def perform_create(self, serializer: BaseSerializer) -> None:
        serializer.save(created_by=self.request.user, updated_by=self.request.user)

    def perform_update(self, serializer: BaseSerializer) -> None:
        serializer.save(updated_by=self.request.user)


class SKUSupplyPlanView(APIView):
    """Singleton nested resource — one plan per line, no row required to
    exist yet.

    GET always returns a shape: the real row if one's been saved, or an
    unsaved default instance (Django applies field defaults on
    instantiation) otherwise. PATCH validates against that instance
    *before* persisting anything, so a rejected PATCH (e.g. under-planned
    without the flag) never leaves a bare zero-filled row behind.
    """

    def get_permissions(self) -> list[BasePermission]:
        if self.request.method == "PATCH":
            return [CanManageExportOrders()]
        return [IsInternalStaff()]

    def get_line(self) -> ExportOrderLine:
        return get_object_or_404(
            ExportOrderLine,
            pk=self.kwargs["line_pk"],
            export_order_id=self.kwargs["export_order_pk"],
        )

    @staticmethod
    def _instance_for(line: ExportOrderLine) -> tuple[SKUSupplyPlan, bool]:
        try:
            return line.supply_plan, False
        except SKUSupplyPlan.DoesNotExist:
            return SKUSupplyPlan(export_order_line=line), True

    def get(self, request: Request, export_order_pk: str, line_pk: str) -> Response:
        instance, _ = self._instance_for(self.get_line())
        return Response(SKUSupplyPlanSerializer(instance).data)

    def patch(self, request: Request, export_order_pk: str, line_pk: str) -> Response:
        line = self.get_line()
        instance, creating = self._instance_for(line)
        serializer = SKUSupplyPlanSerializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        if creating:
            serializer.save(
                export_order_line=line, created_by=request.user, updated_by=request.user
            )
        else:
            serializer.save(updated_by=request.user)
        return Response(serializer.data)


class SKUSupplyPlanListView(APIView):
    """GET-only summary across every line of an order, for the SKU
    Planning tab's table — without this, populating that table would need
    one GET per line. Unpaginated, same reasoning as ExportOrderLineViewSet.
    """

    permission_classes = [IsInternalStaff]

    def get(self, request: Request, export_order_pk: str) -> Response:
        export_order = get_object_or_404(ExportOrder, pk=export_order_pk)
        lines = ExportOrderLine.objects.filter(export_order=export_order).select_related(
            "item",
            "supply_plan",
            "supply_plan__responsible_team",
            "supply_plan__responsible_person",
        )
        rows = []
        for line in lines:
            try:
                rows.append(line.supply_plan)
            except SKUSupplyPlan.DoesNotExist:
                rows.append(SKUSupplyPlan(export_order_line=line))
        return Response(SKUSupplyPlanSummarySerializer(rows, many=True).data)


class ProductionRequirementListView(APIView):
    """GET-only summary across every producible line of an order, for the
    Production tab's table — same "virtual until first write" pattern as
    SKUSupplyPlanListView: a line with a planned production quantity but
    no ProductionRequirement row yet still gets a synthesized zero row.
    """

    permission_classes = [IsInternalStaff]

    def get(self, request: Request, export_order_pk: str) -> Response:
        export_order = get_object_or_404(ExportOrder, pk=export_order_pk)
        lines = (
            ExportOrderLine.objects.filter(export_order=export_order)
            .select_related("item", "supply_plan", "production_requirement")
            .prefetch_related("production_requirement__transactions")
        )
        rows = []
        for line in lines:
            plan = getattr(line, "supply_plan", None)
            if not plan or plan.quantity_to_produce <= 0:
                continue
            requirement = getattr(line, "production_requirement", None)
            rows.append(requirement or ProductionRequirement(export_order_line=line))
        return Response(ProductionRequirementSummarySerializer(rows, many=True).data)


class ProductionTransactionViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """No delete route — corrections are made by editing a transaction in
    place, not removing it (business-rules.md §11).
    """

    serializer_class = ProductionTransactionSerializer
    pagination_class = None
    lookup_url_kwarg = "transaction_pk"

    def get_permissions(self) -> list[BasePermission]:
        if self.action in ("create", "update", "partial_update"):
            return [CanManageProduction()]
        return [IsInternalStaff()]

    def get_line(self) -> ExportOrderLine:
        return get_object_or_404(
            ExportOrderLine,
            pk=self.kwargs["line_pk"],
            export_order_id=self.kwargs["export_order_pk"],
        )

    def get_queryset(self) -> QuerySet[ProductionTransaction]:
        return ProductionTransaction.objects.filter(
            production_requirement__export_order_line_id=self.kwargs["line_pk"]
        )

    def perform_create(self, serializer: BaseSerializer) -> None:
        line = self.get_line()
        plan = getattr(line, "supply_plan", None)
        if not plan or plan.quantity_to_produce <= 0:
            raise ValidationError(
                {"non_field_errors": ["This SKU has no planned production quantity."]}
            )
        requirement, _ = ProductionRequirement.objects.get_or_create(export_order_line=line)
        serializer.save(
            production_requirement=requirement,
            created_by=self.request.user,
            updated_by=self.request.user,
        )

    def perform_update(self, serializer: BaseSerializer) -> None:
        serializer.save(updated_by=self.request.user)


class ProcurementRequirementListView(APIView):
    """GET-only summary across every line of an order that needs
    procurement, for the Procurement tab's table — same "virtual until
    first write" pattern as ProductionRequirementListView.
    """

    permission_classes = [IsInternalStaff]

    def get(self, request: Request, export_order_pk: str) -> Response:
        export_order = get_object_or_404(ExportOrder, pk=export_order_pk)
        lines = (
            ExportOrderLine.objects.filter(export_order=export_order)
            .select_related("item", "supply_plan", "procurement_requirement")
            .prefetch_related("procurement_requirement__transactions")
        )
        rows = []
        for line in lines:
            plan = getattr(line, "supply_plan", None)
            if not plan or plan.quantity_to_procure <= 0:
                continue
            requirement = getattr(line, "procurement_requirement", None)
            rows.append(requirement or ProcurementRequirement(export_order_line=line))
        return Response(ProcurementRequirementSummarySerializer(rows, many=True).data)


class FulfilmentTransactionListView(APIView):
    """GET-only, order-wide, paginated log merging every
    `ProductionTransaction` and `ProcurementTransaction` across the order's
    lines (the Fulfilment tab's "Recent Fulfilment Transactions" table) —
    unlike the per-line list views above, this spans every SKU on the
    order and is paginated, since it can grow large over an order's
    lifetime. Built as a merged plain-dict list, not a queryset union
    (the two source models don't share a table), sorted by `created_at`
    from newest first, same ordering PageNumberPagination expects.
    """

    permission_classes = [IsInternalStaff]

    def get(self, request: Request, export_order_pk: str) -> Response:
        export_order = get_object_or_404(ExportOrder, pk=export_order_pk)
        line_filter = request.query_params.get("line")

        production_qs = ProductionTransaction.objects.filter(
            production_requirement__export_order_line__export_order=export_order
        ).select_related("production_requirement__export_order_line__item", "created_by")
        procurement_qs = ProcurementTransaction.objects.filter(
            procurement_requirement__export_order_line__export_order=export_order
        ).select_related("procurement_requirement__export_order_line__item", "created_by")
        if line_filter:
            line_id = int(line_filter)
            production_qs = production_qs.filter(
                production_requirement__export_order_line_id=line_id
            )
            procurement_qs = procurement_qs.filter(
                procurement_requirement__export_order_line_id=line_id
            )

        rows: list[dict[str, Any]] = []
        for production_txn in production_qs:
            line = production_txn.production_requirement.export_order_line
            rows.append(
                {
                    "id": f"production-{production_txn.id}",
                    "date": production_txn.date,
                    "source": "PRODUCTION",
                    "export_order_line": line.id,
                    "customer_sku_code": line.customer_sku_code,
                    "item_name": line.item.name if line.item else None,
                    "party_team": production_txn.party_team,
                    "quantity": production_txn.quantity_produced,
                    "quantity_accepted": production_txn.quantity_accepted,
                    "quantity_rejected": production_txn.quantity_rejected,
                    "remarks": production_txn.remarks,
                    "entered_by": str(production_txn.created_by)
                    if production_txn.created_by
                    else None,
                    "created_at": production_txn.created_at,
                }
            )
        for procurement_txn in procurement_qs:
            line = procurement_txn.procurement_requirement.export_order_line
            rows.append(
                {
                    "id": f"procurement-{procurement_txn.id}",
                    "date": procurement_txn.date,
                    "source": "PROCUREMENT",
                    "export_order_line": line.id,
                    "customer_sku_code": line.customer_sku_code,
                    "item_name": line.item.name if line.item else None,
                    "party_team": procurement_txn.party_team,
                    "quantity": procurement_txn.quantity_received,
                    "quantity_accepted": procurement_txn.quantity_accepted,
                    "quantity_rejected": procurement_txn.quantity_rejected,
                    "remarks": procurement_txn.remarks,
                    "entered_by": str(procurement_txn.created_by)
                    if procurement_txn.created_by
                    else None,
                    "created_at": procurement_txn.created_at,
                }
            )
        rows.sort(key=lambda row: cast(Any, row["created_at"]), reverse=True)

        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(rows, request, view=self)
        serializer = FulfilmentTransactionSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)


class ProcurementTransactionViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """No delete route — corrections are made by editing a transaction in
    place, not removing it (business-rules.md §11).
    """

    serializer_class = ProcurementTransactionSerializer
    pagination_class = None
    lookup_url_kwarg = "transaction_pk"

    def get_permissions(self) -> list[BasePermission]:
        if self.action in ("create", "update", "partial_update"):
            return [CanManageProcurement()]
        return [IsInternalStaff()]

    def get_line(self) -> ExportOrderLine:
        return get_object_or_404(
            ExportOrderLine,
            pk=self.kwargs["line_pk"],
            export_order_id=self.kwargs["export_order_pk"],
        )

    def get_queryset(self) -> QuerySet[ProcurementTransaction]:
        return ProcurementTransaction.objects.filter(
            procurement_requirement__export_order_line_id=self.kwargs["line_pk"]
        )

    def perform_create(self, serializer: BaseSerializer) -> None:
        line = self.get_line()
        plan = getattr(line, "supply_plan", None)
        if not plan or plan.quantity_to_procure <= 0:
            raise ValidationError(
                {"non_field_errors": ["This SKU has no planned procurement quantity."]}
            )
        requirement, _ = ProcurementRequirement.objects.get_or_create(export_order_line=line)
        serializer.save(
            procurement_requirement=requirement,
            created_by=self.request.user,
            updated_by=self.request.user,
        )

    def perform_update(self, serializer: BaseSerializer) -> None:
        serializer.save(updated_by=self.request.user)


def _is_eligible_for_material(line: ExportOrderLine, material_type: str) -> bool:
    """Which lines appear at all in a given Packing Materials tab — a line
    with no packing config (Piece-unit, no mapping) never appears in any
    of them, same exclusion logic Production/Procurement use for "no
    planned quantity."
    """
    MaterialType = PackingMaterialRequirement.MaterialType
    if material_type in (MaterialType.CARTON, MaterialType.BOX_LABEL):
        return line.required_cartons is not None
    if material_type == MaterialType.POUCH:
        return line.required_pouches is not None
    if material_type == MaterialType.RETAIL_STICKER:
        return bool(line.has_retail_sticker)
    return False


class PackingMaterialRequirementView(APIView):
    """Singleton nested resource — one row per (line, material type), no
    row required to exist yet. Same virtual-default/upsert shape as
    SKUSupplyPlanView, keyed by `material_type` from the URL instead of a
    plain OneToOne.
    """

    def get_permissions(self) -> list[BasePermission]:
        if self.request.method == "PATCH":
            return [CanManagePacking()]
        return [IsInternalStaff()]

    def get_line(self) -> ExportOrderLine:
        return get_object_or_404(
            ExportOrderLine,
            pk=self.kwargs["line_pk"],
            export_order_id=self.kwargs["export_order_pk"],
        )

    def _material_type(self) -> str:
        material_type = self.kwargs["material_type"]
        if material_type not in PackingMaterialRequirement.MaterialType.values:
            raise NotFound("Unknown packing material type.")
        return material_type

    def _instance_for(
        self, line: ExportOrderLine, material_type: str
    ) -> tuple[PackingMaterialRequirement, bool]:
        if not _is_eligible_for_material(line, material_type):
            raise NotFound("This SKU doesn't require this packing material.")
        instance = PackingMaterialRequirement.objects.filter(
            export_order_line=line, material_type=material_type
        ).first()
        if instance is not None:
            return instance, False
        return (
            PackingMaterialRequirement(export_order_line=line, material_type=material_type),
            True,
        )

    def get(
        self, request: Request, export_order_pk: str, line_pk: str, material_type: str
    ) -> Response:
        instance, _ = self._instance_for(self.get_line(), self._material_type())
        return Response(PackingMaterialRequirementSerializer(instance).data)

    def patch(
        self, request: Request, export_order_pk: str, line_pk: str, material_type: str
    ) -> Response:
        line = self.get_line()
        instance, creating = self._instance_for(line, self._material_type())
        serializer = PackingMaterialRequirementSerializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        if creating:
            serializer.save(
                export_order_line=line,
                material_type=material_type,
                created_by=request.user,
                updated_by=request.user,
            )
        else:
            serializer.save(updated_by=request.user)
        return Response(serializer.data)


class PackingMaterialRequirementListView(APIView):
    """GET-only summary across every eligible line of an order, for one
    Packing Materials tab's table — same "virtual until first write"
    pattern as SKUSupplyPlanListView. `?material_type=` is required.
    """

    permission_classes = [IsInternalStaff]

    def get(self, request: Request, export_order_pk: str) -> Response:
        material_type = request.query_params.get("material_type")
        if material_type not in PackingMaterialRequirement.MaterialType.values:
            raise ValidationError(
                {"material_type": ["This field is required and must be a valid material type."]}
            )

        export_order = get_object_or_404(ExportOrder, pk=export_order_pk)
        lines = (
            ExportOrderLine.objects.filter(export_order=export_order)
            .select_related("item")
            .prefetch_related("packing_material_requirements")
        )
        rows = []
        for line in lines:
            if not _is_eligible_for_material(line, material_type):
                continue
            requirement = next(
                (
                    r
                    for r in line.packing_material_requirements.all()
                    if r.material_type == material_type
                ),
                None,
            )
            rows.append(
                requirement
                or PackingMaterialRequirement(export_order_line=line, material_type=material_type)
            )
        return Response(PackingMaterialRequirementSummarySerializer(rows, many=True).data)


class PackingMonitorView(APIView):
    """GET-only summary across every cartonized line of an order, for the
    Packing Monitor table. No "virtual until first write" synthesis is
    needed here (unlike SKU Planning/Production/Procurement/Packing
    Materials): `required_cartons` and the cumulative packed/extra-pouch
    sums are always-live computed properties on `ExportOrderLine` itself,
    so every eligible line already has a real, queryable row.
    """

    permission_classes = [IsInternalStaff]

    def get(self, request: Request, export_order_pk: str) -> Response:
        export_order = get_object_or_404(ExportOrder, pk=export_order_pk)
        lines = (
            ExportOrderLine.objects.filter(export_order=export_order)
            .select_related("item")
            .prefetch_related("packing_transactions")
        )
        rows = [line for line in lines if line.required_cartons is not None]
        return Response(PackingMonitorRowSerializer(rows, many=True).data)


class PackingTransactionLogPagination(PageNumberPagination):
    """Same default page size as the project-wide setting, but lets the
    client override it via `?page_size=` — the Packing tab's mockup shows a
    page-size selector, unlike the Fulfilment tab's fixed-size log. Scoped
    to this one view, not a global pagination-class change.
    """

    page_size_query_param = "page_size"
    max_page_size = 100


class PackingTransactionLogListView(APIView):
    """GET-only, order-wide, paginated log of every `PackingTransaction`
    across the order's lines (the Packing tab's "Recent Packing
    Transactions" table) — simpler than Fulfilment's equivalent
    (`FulfilmentTransactionListView`): only one source model here, so this
    paginates a real queryset instead of a merged list of dicts.
    """

    permission_classes = [IsInternalStaff]
    pagination_class = PackingTransactionLogPagination

    def get(self, request: Request, export_order_pk: str) -> Response:
        export_order = get_object_or_404(ExportOrder, pk=export_order_pk)
        queryset = (
            PackingTransaction.objects.filter(export_order_line__export_order=export_order)
            .select_related("export_order_line__item", "packed_by", "created_by")
            .order_by("-created_at")
        )
        line_filter = request.query_params.get("line")
        if line_filter:
            queryset = queryset.filter(export_order_line_id=int(line_filter))

        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request, view=self)
        serializer = PackingTransactionLogSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)


class PackingTransactionViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """No delete route — corrections are made by editing a transaction in
    place, not removing it (business-rules.md §11).
    """

    serializer_class = PackingTransactionSerializer
    pagination_class = None
    lookup_url_kwarg = "transaction_pk"

    def get_permissions(self) -> list[BasePermission]:
        if self.action in ("create", "update", "partial_update"):
            return [CanManagePacking()]
        return [IsInternalStaff()]

    def get_line(self) -> ExportOrderLine:
        return get_object_or_404(
            ExportOrderLine,
            pk=self.kwargs["line_pk"],
            export_order_id=self.kwargs["export_order_pk"],
        )

    def get_queryset(self) -> QuerySet[PackingTransaction]:
        return PackingTransaction.objects.filter(export_order_line_id=self.kwargs["line_pk"])

    def perform_create(self, serializer: BaseSerializer) -> None:
        line = self.get_line()
        if line.required_cartons is None:
            raise ValidationError(
                {
                    "non_field_errors": [
                        "This SKU has no carton configuration — packing can't be logged here."
                    ]
                }
            )
        serializer.save(
            export_order_line=line,
            created_by=self.request.user,
            updated_by=self.request.user,
        )

    def perform_update(self, serializer: BaseSerializer) -> None:
        serializer.save(updated_by=self.request.user)


class ExportOrderPOVersionViewSet(
    mixins.ListModelMixin, mixins.CreateModelMixin, viewsets.GenericViewSet
):
    serializer_class = ExportOrderPOVersionSerializer

    def get_permissions(self) -> list[BasePermission]:
        if self.action == "create":
            return [CanManageExportOrders()]
        return [IsInternalStaff()]

    def get_export_order(self) -> ExportOrder:
        return get_object_or_404(ExportOrder, pk=self.kwargs["export_order_pk"])

    def get_queryset(self) -> QuerySet[ExportOrderPOVersion]:
        return ExportOrderPOVersion.objects.filter(export_order_id=self.kwargs["export_order_pk"])

    def get_serializer_context(self) -> dict[str, Any]:
        context = dict(super().get_serializer_context())
        context["export_order"] = self.get_export_order()
        return context

    def perform_create(self, serializer: BaseSerializer) -> None:
        serializer.save(created_by=self.request.user, updated_by=self.request.user)


class ExportOrderNoteViewSet(
    mixins.ListModelMixin, mixins.CreateModelMixin, viewsets.GenericViewSet
):
    """List/create only — a note is a timestamped remark, not a field to
    edit or a row to delete (same "append, don't rewrite" precedent as
    `ExportOrderPOVersionViewSet`). Gated to `IsInternalStaff` for both:
    unlike most write actions in this app, adding a note is collaborative
    — any coordinator touching the order should be able to leave one, not
    just the Export Coordinator/Manager role CanManageExportOrders covers.
    """

    serializer_class = ExportOrderNoteSerializer
    permission_classes = [IsInternalStaff]

    def get_export_order(self) -> ExportOrder:
        return get_object_or_404(ExportOrder, pk=self.kwargs["export_order_pk"])

    def get_queryset(self) -> QuerySet[ExportOrderNote]:
        return ExportOrderNote.objects.filter(export_order_id=self.kwargs["export_order_pk"])

    def perform_create(self, serializer: BaseSerializer) -> None:
        serializer.save(
            export_order=self.get_export_order(),
            created_by=self.request.user,
            updated_by=self.request.user,
        )


class ShipmentViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """Full CRUD, same reasoning as `ExportOrderLineViewSet` — a coordinator
    fixing a mis-created shipment deletes and re-enters it.
    """

    serializer_class = ShipmentSerializer
    pagination_class = None
    lookup_url_kwarg = "shipment_pk"

    def get_permissions(self) -> list[BasePermission]:
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [CanManageShipments()]
        return [IsInternalStaff()]

    def get_export_order(self) -> ExportOrder:
        return get_object_or_404(ExportOrder, pk=self.kwargs["export_order_pk"])

    def get_queryset(self) -> QuerySet[Shipment]:
        return Shipment.objects.filter(export_order_id=self.kwargs["export_order_pk"])

    def get_serializer_context(self) -> dict[str, Any]:
        context = dict(super().get_serializer_context())
        context["export_order"] = self.get_export_order()
        return context

    def perform_create(self, serializer: BaseSerializer) -> None:
        serializer.save(created_by=self.request.user, updated_by=self.request.user)

    def perform_update(self, serializer: BaseSerializer) -> None:
        serializer.save(updated_by=self.request.user)


class ShipmentLineViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """Full CRUD, nested one level deeper than `ShipmentViewSet`. The
    over-allocation and cross-order checks live in
    `ShipmentLineSerializer.validate()`, which needs the parent `shipment`
    in context.
    """

    serializer_class = ShipmentLineSerializer
    pagination_class = None
    lookup_url_kwarg = "line_pk"

    def get_permissions(self) -> list[BasePermission]:
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [CanManageShipments()]
        return [IsInternalStaff()]

    def get_shipment(self) -> Shipment:
        return get_object_or_404(
            Shipment,
            pk=self.kwargs["shipment_pk"],
            export_order_id=self.kwargs["export_order_pk"],
        )

    def get_queryset(self) -> QuerySet[ShipmentLine]:
        return ShipmentLine.objects.filter(shipment_id=self.kwargs["shipment_pk"])

    def get_serializer_context(self) -> dict[str, Any]:
        context = dict(super().get_serializer_context())
        context["shipment"] = self.get_shipment()
        return context

    def perform_create(self, serializer: BaseSerializer) -> None:
        serializer.save(
            shipment=self.get_shipment(), created_by=self.request.user, updated_by=self.request.user
        )
        cast(ShipmentLine, serializer.instance).export_order_line.sync_stock_return()

    def perform_update(self, serializer: BaseSerializer) -> None:
        serializer.save(updated_by=self.request.user)
        cast(ShipmentLine, serializer.instance).export_order_line.sync_stock_return()

    def perform_destroy(self, instance: ShipmentLine) -> None:
        export_order_line = instance.export_order_line
        instance.delete()
        export_order_line.sync_stock_return()


class LoadingTransactionLogPagination(PageNumberPagination):
    """Same shape as `PackingTransactionLogPagination` — client-overridable
    page size via `?page_size=`, scoped to this one view.
    """

    page_size_query_param = "page_size"
    max_page_size = 100


class LoadingTransactionLogListView(APIView):
    """GET-only, paginated log of every `LoadingTransaction` across one
    Shipment's lines (the Loading tab's collapsed "Loading Transactions"
    feed) — scoped to a single Shipment, not the whole order, unlike
    Fulfilment's/Packing's logs: a SKU split across Shipments has
    genuinely separate loading progress per Shipment, so mixing them into
    one order-wide feed would misrepresent which container a row belongs to.
    """

    permission_classes = [IsInternalStaff]
    pagination_class = LoadingTransactionLogPagination

    def get(self, request: Request, export_order_pk: str, shipment_pk: str) -> Response:
        shipment = get_object_or_404(Shipment, pk=shipment_pk, export_order_id=export_order_pk)
        queryset = (
            LoadingTransaction.objects.filter(shipment_line__shipment=shipment)
            .select_related("shipment_line__export_order_line__item", "created_by")
            .order_by("-created_at")
        )
        line_filter = request.query_params.get("line")
        if line_filter:
            queryset = queryset.filter(shipment_line__export_order_line_id=int(line_filter))

        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request, view=self)
        serializer = LoadingTransactionLogSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)


class LoadingTransactionViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """No delete route — corrections are made by editing a transaction in
    place, same convention as Production/Procurement/Packing
    (business-rules.md §11). `sync_stock_return()` fires after every
    save, same as `ShipmentLineViewSet` — loading changes affect the
    packed-but-not-loaded stock reconciliation.
    """

    serializer_class = LoadingTransactionSerializer
    pagination_class = None
    lookup_url_kwarg = "transaction_pk"

    def get_permissions(self) -> list[BasePermission]:
        if self.action in ("create", "update", "partial_update"):
            return [CanManageShipments()]
        return [IsInternalStaff()]

    def get_shipment_line(self) -> ShipmentLine:
        return get_object_or_404(
            ShipmentLine,
            pk=self.kwargs["line_pk"],
            shipment_id=self.kwargs["shipment_pk"],
            shipment__export_order_id=self.kwargs["export_order_pk"],
        )

    def get_queryset(self) -> QuerySet[LoadingTransaction]:
        return LoadingTransaction.objects.filter(shipment_line_id=self.kwargs["line_pk"])

    def get_serializer_context(self) -> dict[str, Any]:
        context = dict(super().get_serializer_context())
        context["shipment_line"] = self.get_shipment_line()
        return context

    def perform_create(self, serializer: BaseSerializer) -> None:
        serializer.save(
            shipment_line=self.get_shipment_line(),
            created_by=self.request.user,
            updated_by=self.request.user,
        )
        cast(
            LoadingTransaction, serializer.instance
        ).shipment_line.export_order_line.sync_stock_return()

    def perform_update(self, serializer: BaseSerializer) -> None:
        serializer.save(updated_by=self.request.user)
        cast(
            LoadingTransaction, serializer.instance
        ).shipment_line.export_order_line.sync_stock_return()
