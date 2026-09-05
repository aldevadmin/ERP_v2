from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    OutputClassificationViewSet,
    ProcessCategoryViewSet,
    ProcessDefinitionVersionViewSet,
    ProcessDefinitionViewSet,
    ProcessExecutionViewSet,
)

router = DefaultRouter()
router.register("process-categories", ProcessCategoryViewSet, basename="process-category")
router.register(
    "output-classifications", OutputClassificationViewSet, basename="output-classification"
)
router.register("process-definitions", ProcessDefinitionViewSet, basename="process-definition")
router.register(
    "process-definition-versions",
    ProcessDefinitionVersionViewSet,
    basename="process-definition-version",
)
router.register("process-executions", ProcessExecutionViewSet, basename="process-execution")

urlpatterns = [
    path("", include(router.urls)),
]
