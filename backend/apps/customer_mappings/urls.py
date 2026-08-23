from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    CustomerProductMappingVersionViewSet,
    CustomerProductMappingViewSet,
    MappingFileViewSet,
)

router = DefaultRouter()
router.register(
    "customer-product-mappings", CustomerProductMappingViewSet, basename="customer-product-mapping"
)
router.register(
    "customer-product-mapping-versions",
    CustomerProductMappingVersionViewSet,
    basename="customer-product-mapping-version",
)

mapping_file_list = MappingFileViewSet.as_view({"get": "list", "post": "create"})
mapping_file_detail = MappingFileViewSet.as_view({"delete": "destroy"})

urlpatterns = [
    path("", include(router.urls)),
    path(
        "customer-product-mapping-versions/<int:mapping_version_pk>/files/",
        mapping_file_list,
        name="customer-product-mapping-version-files",
    ),
    path(
        "customer-product-mapping-versions/<int:mapping_version_pk>/files/<int:file_pk>/",
        mapping_file_detail,
        name="customer-product-mapping-version-file-detail",
    ),
]
