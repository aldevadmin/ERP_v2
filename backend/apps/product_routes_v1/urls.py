from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import ProcessRouteV1ViewSet, ProcessRouteVersionV1ViewSet

router = DefaultRouter()
router.register("product-routes-v1", ProcessRouteV1ViewSet, basename="process-route-v1")
router.register(
    "product-route-versions-v1", ProcessRouteVersionV1ViewSet, basename="process-route-version-v1"
)

urlpatterns = [
    path("", include(router.urls)),
]
