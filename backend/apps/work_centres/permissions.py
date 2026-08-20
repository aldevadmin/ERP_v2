from apps.accounts.permissions import HasAnyRole

# Every internal staff role can look work centres up — Production/Packing
# need to know what a process can run on. Excludes "Customer", same
# reasoning as apps.materials/apps.products.
IsInternalStaff = HasAnyRole(
    "Export Coordinator",
    "Production Coordinator",
    "Procurement Coordinator",
    "Packing Coordinator",
    "Logistics Coordinator",
    "Manager/Admin",
)

# Same coordinator/admin gate as apps.processes.permissions.CanManageProcesses.
CanManageWorkCentres = HasAnyRole("Export Coordinator", "Manager/Admin")
