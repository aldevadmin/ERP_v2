from apps.accounts.permissions import HasAnyRole

# Every internal staff role can view the customer list — many future
# screens across modules will need to look up a customer. It excludes
# "Customer" deliberately: this endpoint returns every customer, unscoped,
# and there is no customer-portal login (CustomerContact) to scope it yet.
IsInternalStaff = HasAnyRole(
    "Export Coordinator",
    "Production Coordinator",
    "Procurement Coordinator",
    "Packing Coordinator",
    "Logistics Coordinator",
    "Manager/Admin",
)

# Only the roles that actually set up customers as part of order intake.
CanManageCustomers = HasAnyRole("Export Coordinator", "Manager/Admin")
