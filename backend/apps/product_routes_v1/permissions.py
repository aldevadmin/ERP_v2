from apps.accounts.permissions import HasAnyRole

# Same role set as apps.product_routes.permissions.IsInternalStaff.
IsInternalStaff = HasAnyRole(
    "Export Coordinator",
    "Production Coordinator",
    "Procurement Coordinator",
    "Packing Coordinator",
    "Logistics Coordinator",
    "Manager/Admin",
)

# Same coordinator/admin gate as apps.product_routes.permissions.CanManageProductRoutes.
CanManageProductRoutes = HasAnyRole("Export Coordinator", "Manager/Admin")
