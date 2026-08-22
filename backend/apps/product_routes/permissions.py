from apps.accounts.permissions import HasAnyRole

# Same role set as apps.processes.permissions.IsInternalStaff — routes are
# configuration data every coordinator role needs to read (planning,
# production, packing all consult a product's route).
IsInternalStaff = HasAnyRole(
    "Export Coordinator",
    "Production Coordinator",
    "Procurement Coordinator",
    "Packing Coordinator",
    "Logistics Coordinator",
    "Manager/Admin",
)

# Same coordinator/admin gate as apps.processes.permissions.CanManageProcesses.
CanManageProductRoutes = HasAnyRole("Export Coordinator", "Manager/Admin")
