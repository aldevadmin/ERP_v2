from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import CustomerSKUMappingFileViewSet, CustomerSKUMappingViewSet, ProductViewSet

router = DefaultRouter()
router.register("products", ProductViewSet, basename="product")
router.register("customer-sku-mappings", CustomerSKUMappingViewSet, basename="customer-sku-mapping")

mapping_file_list = CustomerSKUMappingFileViewSet.as_view({"get": "list", "post": "create"})
mapping_file_detail = CustomerSKUMappingFileViewSet.as_view({"delete": "destroy"})

urlpatterns = [
    path("", include(router.urls)),
    path(
        "customer-sku-mappings/<int:customer_sku_mapping_pk>/files/",
        mapping_file_list,
        name="customer-sku-mapping-files",
    ),
    path(
        "customer-sku-mappings/<int:customer_sku_mapping_pk>/files/<int:file_pk>/",
        mapping_file_detail,
        name="customer-sku-mapping-file-detail",
    ),
]
