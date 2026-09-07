from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    PackingJobViewSet,
    PackingMaterialRequestViewSet,
    PackingOrdersView,
    PackingPlanLineViewSet,
    PackingWorkCentreAllocationViewSet,
    PackingWorkSessionViewSet,
    ShiftViewSet,
    TodaysWorkView,
)

router = DefaultRouter()
router.register("shifts", ShiftViewSet, basename="shift")
router.register("packing-plan-lines", PackingPlanLineViewSet, basename="packing-plan-line")
router.register("packing-jobs", PackingJobViewSet, basename="packing-job")
router.register(
    "packing-material-requests", PackingMaterialRequestViewSet, basename="packing-material-request"
)
router.register(
    "packing-allocations", PackingWorkCentreAllocationViewSet, basename="packing-allocation"
)
router.register("packing-work-sessions", PackingWorkSessionViewSet, basename="packing-work-session")

urlpatterns = [
    path("packing-orders/", PackingOrdersView.as_view(), name="packing-orders"),
    path("packing-today/", TodaysWorkView.as_view(), name="packing-today"),
    path("", include(router.urls)),
]
