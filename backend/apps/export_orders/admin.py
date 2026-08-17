from django.contrib import admin

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


class ExportOrderPOVersionInline(admin.TabularInline):
    model = ExportOrderPOVersion
    extra = 0
    readonly_fields = ("version_number",)


class ExportOrderLineInline(admin.TabularInline):
    model = ExportOrderLine
    extra = 0
    readonly_fields = ("line_number", "pieces_per_pouch", "pouches_per_carton")


@admin.register(ExportOrder)
class ExportOrderAdmin(admin.ModelAdmin):
    list_display = (
        "order_number",
        "customer",
        "customer_po_number",
        "status",
        "export_coordinator",
    )
    list_filter = ("status",)
    search_fields = ("order_number", "customer_po_number", "customer__name")
    # bill_to/ship_to (CustomerAddress) excluded — that model has no
    # standalone ModelAdmin (it's inline-only under Customer), and
    # autocomplete_fields requires one.
    autocomplete_fields = ("customer", "export_coordinator")
    readonly_fields = ("order_number",)
    inlines = [ExportOrderPOVersionInline, ExportOrderLineInline]


@admin.register(ExportOrderStageEvent)
class ExportOrderStageEventAdmin(admin.ModelAdmin):
    list_display = ("export_order", "status", "created_at", "created_by")
    list_filter = ("status",)
    search_fields = ("export_order__order_number",)


@admin.register(ExportOrderNote)
class ExportOrderNoteAdmin(admin.ModelAdmin):
    list_display = ("export_order", "text", "created_at", "created_by")
    search_fields = ("export_order__order_number", "text")


@admin.register(SKUSupplyPlan)
class SKUSupplyPlanAdmin(admin.ModelAdmin):
    list_display = (
        "export_order_line",
        "quantity_from_stock",
        "quantity_to_produce",
        "quantity_to_procure",
        "planning_status",
        "risk_status",
    )
    list_filter = ("planning_status", "risk_status")


class ProductionTransactionInline(admin.TabularInline):
    model = ProductionTransaction
    extra = 0


@admin.register(ProductionRequirement)
class ProductionRequirementAdmin(admin.ModelAdmin):
    list_display = (
        "export_order_line",
        "planned_qty",
        "cumulative_accepted",
        "status",
    )
    inlines = [ProductionTransactionInline]


class ProcurementTransactionInline(admin.TabularInline):
    model = ProcurementTransaction
    extra = 0
    autocomplete_fields = ("vendor",)


@admin.register(ProcurementRequirement)
class ProcurementRequirementAdmin(admin.ModelAdmin):
    list_display = (
        "export_order_line",
        "planned_qty",
        "cumulative_accepted",
        "status",
    )
    inlines = [ProcurementTransactionInline]


@admin.register(PackingMaterialRequirement)
class PackingMaterialRequirementAdmin(admin.ModelAdmin):
    list_display = (
        "export_order_line",
        "material_type",
        "required_qty",
        "available_stock",
        "shortage",
        "status",
    )
    list_filter = ("material_type", "status")


@admin.register(PackingTransaction)
class PackingTransactionAdmin(admin.ModelAdmin):
    list_display = (
        "export_order_line",
        "date",
        "entry_type",
        "cartons_packed",
        "pouches_packed",
        "calculated_pieces",
        "packed_by",
        "shift_team",
    )
    list_filter = ("entry_type",)


class LoadingTransactionInline(admin.TabularInline):
    model = LoadingTransaction
    extra = 0


class ShipmentLineInline(admin.TabularInline):
    model = ShipmentLine
    extra = 0


@admin.register(LoadingTransaction)
class LoadingTransactionAdmin(admin.ModelAdmin):
    list_display = (
        "shipment_line",
        "date",
        "entry_type",
        "cartons_loaded",
        "pouches_loaded",
        "calculated_pieces",
        "variance_reason",
    )
    list_filter = ("entry_type",)


@admin.register(Shipment)
class ShipmentAdmin(admin.ModelAdmin):
    list_display = (
        "shipment_number",
        "export_order",
        "status",
        "container_number",
    )
    list_filter = ("status",)
    search_fields = ("shipment_number", "export_order__order_number")
    readonly_fields = ("shipment_number",)
    inlines = [ShipmentLineInline]
