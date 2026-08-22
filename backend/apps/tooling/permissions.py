from apps.accounts.permissions import HasAnyRole

# Same role set as apps.work_centres.permissions.IsInternalStaff — tooling
# assignments are read by every coordinator role that touches production.
IsInternalStaff = HasAnyRole(
    "Export Coordinator",
    "Production Coordinator",
    "Procurement Coordinator",
    "Packing Coordinator",
    "Logistics Coordinator",
    "Manager/Admin",
)

# Same coordinator/admin gate as apps.work_centres.permissions.CanManageWorkCentres.
CanManageTooling = HasAnyRole("Export Coordinator", "Manager/Admin")
