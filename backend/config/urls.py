from typing import Any

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

urlpatterns: list[Any] = [
    path("admin/", admin.site.urls),
    path("api/v1/", include("apps.core.urls")),
    path("api/v1/", include("apps.accounts.urls")),
    path("api/v1/", include("apps.customers.urls")),
    path("api/v1/", include("apps.vendors.urls")),
    path("api/v1/", include("apps.items.urls")),
    path("api/v1/", include("apps.processes.urls")),
    path("api/v1/", include("apps.work_centres.urls")),
    path("api/v1/", include("apps.product_routes.urls")),
    path("api/v1/", include("apps.tooling.urls")),
    path("api/v1/", include("apps.packaging.urls")),
    path("api/v1/", include("apps.customer_mappings.urls")),
    path("api/v1/", include("apps.export_orders.urls")),
    path("api/v1/", include("apps.packing.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
