from apps.accounts.permissions import HasAnyRole

# Same role set as apps.export_orders.permissions.IsInternalStaff — anyone
# who needs to see the All Orders list.
IsInternalStaff = HasAnyRole(
    "Export Coordinator",
    "Production Coordinator",
    "Procurement Coordinator",
    "Packing Coordinator",
    "Logistics Coordinator",
    "Manager/Admin",
)

# Gate for anything that changes a line's workflow state (e.g. On Hold).
# Same gate as apps.export_orders.permissions.CanManagePacking /
# apps.packing.permissions.CanManagePacking.
CanManagePacking = HasAnyRole("Export Coordinator", "Packing Coordinator", "Manager/Admin")
