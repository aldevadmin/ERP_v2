from apps.accounts.permissions import HasAnyRole

IsInternalStaff = HasAnyRole(
    "Export Coordinator",
    "Production Coordinator",
    "Procurement Coordinator",
    "Packing Coordinator",
    "Logistics Coordinator",
    "Manager/Admin",
)

CanManagePackaging = HasAnyRole("Export Coordinator", "Manager/Admin")
