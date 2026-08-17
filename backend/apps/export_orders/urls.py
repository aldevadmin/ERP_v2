from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    ExportOrderLineViewSet,
    ExportOrderNoteViewSet,
    ExportOrderPOVersionViewSet,
    ExportOrderViewSet,
    FulfilmentTransactionListView,
    LoadingTransactionLogListView,
    LoadingTransactionViewSet,
    PackingMaterialRequirementListView,
    PackingMaterialRequirementView,
    PackingMonitorView,
    PackingTransactionLogListView,
    PackingTransactionViewSet,
    ProcurementRequirementListView,
    ProcurementTransactionViewSet,
    ProductionRequirementListView,
    ProductionTransactionViewSet,
    ShipmentLineViewSet,
    ShipmentViewSet,
    SKUSupplyPlanListView,
    SKUSupplyPlanView,
)

router = DefaultRouter()
router.register("export-orders", ExportOrderViewSet, basename="export-order")

po_version_list = ExportOrderPOVersionViewSet.as_view({"get": "list", "post": "create"})
note_list = ExportOrderNoteViewSet.as_view({"get": "list", "post": "create"})

line_list = ExportOrderLineViewSet.as_view({"get": "list", "post": "create"})
line_detail = ExportOrderLineViewSet.as_view(
    {"get": "retrieve", "patch": "partial_update", "put": "update", "delete": "destroy"}
)

supply_plan_detail = SKUSupplyPlanView.as_view()
supply_plan_list = SKUSupplyPlanListView.as_view()

production_requirement_list = ProductionRequirementListView.as_view()
production_transaction_list = ProductionTransactionViewSet.as_view(
    {"get": "list", "post": "create"}
)
production_transaction_detail = ProductionTransactionViewSet.as_view(
    {"patch": "partial_update", "put": "update"}
)

procurement_requirement_list = ProcurementRequirementListView.as_view()
fulfilment_transaction_list = FulfilmentTransactionListView.as_view()
procurement_transaction_list = ProcurementTransactionViewSet.as_view(
    {"get": "list", "post": "create"}
)
procurement_transaction_detail = ProcurementTransactionViewSet.as_view(
    {"patch": "partial_update", "put": "update"}
)

packing_material_requirement_list = PackingMaterialRequirementListView.as_view()
packing_material_requirement_detail = PackingMaterialRequirementView.as_view()

packing_monitor = PackingMonitorView.as_view()
packing_transaction_log = PackingTransactionLogListView.as_view()
packing_transaction_list = PackingTransactionViewSet.as_view({"get": "list", "post": "create"})
packing_transaction_detail = PackingTransactionViewSet.as_view(
    {"patch": "partial_update", "put": "update"}
)

shipment_list = ShipmentViewSet.as_view({"get": "list", "post": "create"})
shipment_detail = ShipmentViewSet.as_view(
    {"get": "retrieve", "patch": "partial_update", "put": "update", "delete": "destroy"}
)
shipment_line_list = ShipmentLineViewSet.as_view({"get": "list", "post": "create"})
shipment_line_detail = ShipmentLineViewSet.as_view(
    {"get": "retrieve", "patch": "partial_update", "put": "update", "delete": "destroy"}
)

loading_transaction_log = LoadingTransactionLogListView.as_view()
loading_transaction_list = LoadingTransactionViewSet.as_view({"get": "list", "post": "create"})
loading_transaction_detail = LoadingTransactionViewSet.as_view(
    {"patch": "partial_update", "put": "update"}
)

urlpatterns = [
    path("", include(router.urls)),
    path(
        "export-orders/<int:export_order_pk>/po-versions/",
        po_version_list,
        name="export-order-po-versions",
    ),
    path(
        "export-orders/<int:export_order_pk>/notes/",
        note_list,
        name="export-order-notes",
    ),
    path(
        "export-orders/<int:export_order_pk>/lines/",
        line_list,
        name="export-order-lines",
    ),
    path(
        "export-orders/<int:export_order_pk>/lines/<int:line_pk>/",
        line_detail,
        name="export-order-line-detail",
    ),
    path(
        "export-orders/<int:export_order_pk>/lines/<int:line_pk>/supply-plan/",
        supply_plan_detail,
        name="export-order-line-supply-plan",
    ),
    path(
        "export-orders/<int:export_order_pk>/supply-plans/",
        supply_plan_list,
        name="export-order-supply-plans",
    ),
    path(
        "export-orders/<int:export_order_pk>/production-requirements/",
        production_requirement_list,
        name="export-order-production-requirements",
    ),
    path(
        "export-orders/<int:export_order_pk>/lines/<int:line_pk>/production-transactions/",
        production_transaction_list,
        name="export-order-line-production-transactions",
    ),
    path(
        "export-orders/<int:export_order_pk>/lines/<int:line_pk>/production-transactions/"
        "<int:transaction_pk>/",
        production_transaction_detail,
        name="export-order-line-production-transaction-detail",
    ),
    path(
        "export-orders/<int:export_order_pk>/procurement-requirements/",
        procurement_requirement_list,
        name="export-order-procurement-requirements",
    ),
    path(
        "export-orders/<int:export_order_pk>/lines/<int:line_pk>/procurement-transactions/",
        procurement_transaction_list,
        name="export-order-line-procurement-transactions",
    ),
    path(
        "export-orders/<int:export_order_pk>/lines/<int:line_pk>/procurement-transactions/"
        "<int:transaction_pk>/",
        procurement_transaction_detail,
        name="export-order-line-procurement-transaction-detail",
    ),
    path(
        "export-orders/<int:export_order_pk>/fulfilment-transactions/",
        fulfilment_transaction_list,
        name="export-order-fulfilment-transactions",
    ),
    path(
        "export-orders/<int:export_order_pk>/packing-material-requirements/",
        packing_material_requirement_list,
        name="export-order-packing-material-requirements",
    ),
    path(
        "export-orders/<int:export_order_pk>/lines/<int:line_pk>/packing-material-requirements/"
        "<str:material_type>/",
        packing_material_requirement_detail,
        name="export-order-line-packing-material-requirement-detail",
    ),
    path(
        "export-orders/<int:export_order_pk>/packing-monitor/",
        packing_monitor,
        name="export-order-packing-monitor",
    ),
    path(
        "export-orders/<int:export_order_pk>/packing-transactions/",
        packing_transaction_log,
        name="export-order-packing-transactions",
    ),
    path(
        "export-orders/<int:export_order_pk>/lines/<int:line_pk>/packing-transactions/",
        packing_transaction_list,
        name="export-order-line-packing-transactions",
    ),
    path(
        "export-orders/<int:export_order_pk>/lines/<int:line_pk>/packing-transactions/"
        "<int:transaction_pk>/",
        packing_transaction_detail,
        name="export-order-line-packing-transaction-detail",
    ),
    path(
        "export-orders/<int:export_order_pk>/shipments/",
        shipment_list,
        name="export-order-shipments",
    ),
    path(
        "export-orders/<int:export_order_pk>/shipments/<int:shipment_pk>/",
        shipment_detail,
        name="export-order-shipment-detail",
    ),
    path(
        "export-orders/<int:export_order_pk>/shipments/<int:shipment_pk>/lines/",
        shipment_line_list,
        name="export-order-shipment-lines",
    ),
    path(
        "export-orders/<int:export_order_pk>/shipments/<int:shipment_pk>/lines/<int:line_pk>/",
        shipment_line_detail,
        name="export-order-shipment-line-detail",
    ),
    path(
        "export-orders/<int:export_order_pk>/shipments/<int:shipment_pk>/loading-transactions/",
        loading_transaction_log,
        name="export-order-shipment-loading-transactions",
    ),
    path(
        "export-orders/<int:export_order_pk>/shipments/<int:shipment_pk>/lines/<int:line_pk>/"
        "loading-transactions/",
        loading_transaction_list,
        name="export-order-shipment-line-loading-transactions",
    ),
    path(
        "export-orders/<int:export_order_pk>/shipments/<int:shipment_pk>/lines/<int:line_pk>/"
        "loading-transactions/<int:transaction_pk>/",
        loading_transaction_detail,
        name="export-order-shipment-line-loading-transaction-detail",
    ),
]
