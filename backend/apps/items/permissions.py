from apps.accounts.permissions import HasAnyRole

# Every internal staff role can look items up — Processes, Product Routes,
# and Tooling all reference them. Excludes "Customer", same reasoning as
# apps.materials/apps.products/apps.work_centres.
IsInternalStaff = HasAnyRole(
    "Export Coordinator",
    "Production Coordinator",
    "Procurement Coordinator",
    "Packing Coordinator",
    "Logistics Coordinator",
    "Manager/Admin",
)

# Same coordinator/admin gate as every other master-data app in this codebase.
CanManageItems = HasAnyRole("Export Coordinator", "Manager/Admin")
