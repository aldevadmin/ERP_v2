from apps.accounts.permissions import HasAnyRole

# Every internal staff role can look SKUs up — Export Orders, Inventory,
# Production, Procurement, Packing and Sales all need to. Excludes
# "Customer" for the same reason apps/customers does: this is an unscoped,
# internal-only listing.
IsInternalStaff = HasAnyRole(
    "Export Coordinator",
    "Production Coordinator",
    "Procurement Coordinator",
    "Packing Coordinator",
    "Logistics Coordinator",
    "Manager/Admin",
)

# Same coordinator/admin gate as apps.customers.permissions.CanManageCustomers.
CanManageProducts = HasAnyRole("Export Coordinator", "Manager/Admin")
