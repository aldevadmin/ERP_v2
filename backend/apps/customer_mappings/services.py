import datetime

from django.db.models import Q
from django.utils import timezone

from .models import CustomerProductMapping, CustomerProductMappingVersion


def resolve_customer_product(
    customer_id: int, customer_sku: str, as_of_date: datetime.date | None = None
) -> CustomerProductMappingVersion | None:
    """Single place mapping resolution happens — backs both the Mapping
    Preview screen and the Export Order Add-Product flow, so there's never
    a second, possibly-diverging implementation of "what applies today."

    Resolved by `customer_sku`, not `item` — a customer can have several
    simultaneous mappings against the same item (e.g. two pack sizes sold
    as two different SKUs), so `customer_sku` is the real identity.

    Returns the one published version of the customer+SKU mapping whose
    effective range covers `as_of_date` (defaults to today), or `None` if
    no usable mapping exists — never a stale/inactive fallback.
    """
    as_of = as_of_date or timezone.localdate()
    try:
        mapping = CustomerProductMapping.objects.get(
            customer_id=customer_id, customer_sku=customer_sku, is_active=True
        )
    except CustomerProductMapping.DoesNotExist:
        return None

    return (
        mapping.versions.filter(status=CustomerProductMappingVersion.Status.PUBLISHED)
        .filter(Q(effective_from__isnull=True) | Q(effective_from__lte=as_of))
        .filter(Q(effective_to__isnull=True) | Q(effective_to__gte=as_of))
        .order_by("-version_number")
        .first()
    )
