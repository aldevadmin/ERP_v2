from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    PackingExecutionConfigView,
    PackingIntervalRecordViewSet,
    PackingJobViewSet,
    PackingMaterialRequestViewSet,
    PackingOrdersView,
    PackingPlanLineViewSet,
    PackingShiftViewSet,
    PackingWorkCentreAllocationViewSet,
    PackingWorkCentreSessionViewSet,
    ShiftViewSet,
    TodaysShiftView,
    WorkCentreIssueEventViewSet,
)

router = DefaultRouter()
router.register("shifts", ShiftViewSet, basename="shift")
router.register("packing-plan-lines", PackingPlanLineViewSet, basename="packing-plan-line")
router.register("packing-jobs", PackingJobViewSet, basename="packing-job")
router.register(
    "packing-material-requests", PackingMaterialRequestViewSet, basename="packing-material-request"
)
router.register("packing-shifts", PackingShiftViewSet, basename="packing-shift")
router.register(
    "packing-work-centre-sessions", PackingWorkCentreSessionViewSet, basename="packing-work-centre-session"
)
router.register(
    "packing-allocations", PackingWorkCentreAllocationViewSet, basename="packing-allocation"
)
router.register(
    "packing-interval-records", PackingIntervalRecordViewSet, basename="packing-interval-record"
)
router.register("packing-issue-events", WorkCentreIssueEventViewSet, basename="packing-issue-event")

urlpatterns = [
    path("packing-orders/", PackingOrdersView.as_view(), name="packing-orders"),
    path("packing-today/", TodaysShiftView.as_view(), name="packing-today"),
    path(
        "packing-execution-config/",
        PackingExecutionConfigView.as_view(),
        name="packing-execution-config",
    ),
    path("", include(router.urls)),
]
