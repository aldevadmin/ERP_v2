from apps.accounts.permissions import HasAnyRole

# Every internal staff role can view export orders — Production/Procurement/
# Packing/Logistics coordinators will all need visibility once those phases
# exist. Excludes "Customer" — same reasoning as apps.customers/apps.products:
# this is an unscoped, internal-only listing (a future customer portal is a
# separate, narrow read surface, not this endpoint).
IsInternalStaff = HasAnyRole(
    "Export Coordinator",
    "Production Coordinator",
    "Procurement Coordinator",
    "Packing Coordinator",
    "Logistics Coordinator",
    "Manager/Admin",
)

# Same coordinator/admin gate as apps.customers/apps.products.
CanManageExportOrders = HasAnyRole("Export Coordinator", "Manager/Admin")

# Production Coordinator can enter daily production transactions; Export
# Coordinator keeps write access as a fallback (ui-spec.md §7).
CanManageProduction = HasAnyRole("Export Coordinator", "Production Coordinator", "Manager/Admin")

# Procurement Coordinator can record receipts; Export Coordinator keeps
# write access as a fallback (ui-spec.md §7).
CanManageProcurement = HasAnyRole("Export Coordinator", "Procurement Coordinator", "Manager/Admin")

# Packing Coordinator can update packing material requirements; Export
# Coordinator keeps write access as a fallback (ui-spec.md §7).
CanManagePacking = HasAnyRole("Export Coordinator", "Packing Coordinator", "Manager/Admin")

# Logistics Coordinator can create/manage Shipments; Export Coordinator
# keeps write access, same shape as every other CanManage* (ui-spec.md §7:
# "Create Shipments, upload documents").
CanManageShipments = HasAnyRole("Export Coordinator", "Logistics Coordinator", "Manager/Admin")
