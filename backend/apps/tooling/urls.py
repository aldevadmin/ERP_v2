from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    ToolingAssignmentViewSet,
    ToolingTypeViewSet,
    ToolingViewSet,
    WorkCentrePositionViewSet,
)

router = DefaultRouter()
router.register("tooling", ToolingViewSet, basename="tooling")
router.register("tooling-types", ToolingTypeViewSet, basename="tooling-type")
router.register("work-centre-positions", WorkCentrePositionViewSet, basename="work-centre-position")
router.register("tooling-assignments", ToolingAssignmentViewSet, basename="tooling-assignment")

urlpatterns = [
    path("", include(router.urls)),
]
