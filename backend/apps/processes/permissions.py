from apps.accounts.permissions import HasAnyRole

# Every internal staff role can look processes/categories up — Production,
# Packing and Inventory all reference process definitions. Excludes
# "Customer", same reasoning as apps.products.
IsInternalStaff = HasAnyRole(
    "Export Coordinator",
    "Production Coordinator",
    "Procurement Coordinator",
    "Packing Coordinator",
    "Logistics Coordinator",
    "Manager/Admin",
)

# Same coordinator/admin gate as apps.products.permissions.CanManageProducts.
# Applies to both Process and ProcessCategory — categories are configuration
# data in the same spirit as the processes that use them.
CanManageProcesses = HasAnyRole("Export Coordinator", "Manager/Admin")
