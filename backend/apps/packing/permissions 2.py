from apps.accounts.permissions import HasAnyRole

# Same role set as apps.export_orders.permissions.IsInternalStaff — anyone
# who needs to see packing demand/plans/jobs.
IsInternalStaff = HasAnyRole(
    "Export Coordinator",
    "Production Coordinator",
    "Procurement Coordinator",
    "Packing Coordinator",
    "Logistics Coordinator",
    "Manager/Admin",
)

# Packing Head / warehouse-in-charge actions — planning, allocating,
# fulfilling material requests. Same gate as
# apps.export_orders.permissions.CanManagePacking.
CanManagePacking = HasAnyRole("Export Coordinator", "Packing Coordinator", "Manager/Admin")
