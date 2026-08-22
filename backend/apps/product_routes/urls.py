from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import ProcessRouteVersionViewSet, ProcessRouteViewSet, StorageLocationViewSet

router = DefaultRouter()
router.register("storage-locations", StorageLocationViewSet, basename="storage-location")
router.register("product-routes", ProcessRouteViewSet, basename="process-route")
router.register(
    "product-route-versions", ProcessRouteVersionViewSet, basename="process-route-version"
)

urlpatterns = [
    path("", include(router.urls)),
]
