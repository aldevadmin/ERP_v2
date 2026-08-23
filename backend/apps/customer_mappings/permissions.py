from apps.accounts.permissions import HasAnyRole

IsInternalStaff = HasAnyRole(
    "Export Coordinator",
    "Production Coordinator",
    "Procurement Coordinator",
    "Packing Coordinator",
    "Logistics Coordinator",
    "Manager/Admin",
)

CanManageMappings = HasAnyRole("Export Coordinator", "Manager/Admin")
