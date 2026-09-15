from apps.accounts.permissions import HasAnyRole

# Same role set as apps.processes.permissions.IsInternalStaff — every
# internal staff role can look process definitions up.
IsInternalStaff = HasAnyRole(
    "Export Coordinator",
    "Production Coordinator",
    "Procurement Coordinator",
    "Packing Coordinator",
    "Logistics Coordinator",
    "Manager/Admin",
)

# Same coordinator/admin gate as apps.processes.permissions.CanManageProcesses.
CanManageProcesses = HasAnyRole("Export Coordinator", "Manager/Admin")
