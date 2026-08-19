from apps.accounts.permissions import HasAnyRole

# Every internal staff role can look materials up — Processes references
# them, and any of these roles may need to check what a process consumes
# or produces. Excludes "Customer", same reasoning as apps.products.
IsInternalStaff = HasAnyRole(
    "Export Coordinator",
    "Production Coordinator",
    "Procurement Coordinator",
    "Packing Coordinator",
    "Logistics Coordinator",
    "Manager/Admin",
)

# Same coordinator/admin gate as apps.products.permissions.CanManageProducts.
CanManageMaterials = HasAnyRole("Export Coordinator", "Manager/Admin")
