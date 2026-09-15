from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import ProcessDefinitionV1ViewSet, ProcessDefinitionVersionV1ViewSet

router = DefaultRouter()
router.register(
    "process-definitions-v1", ProcessDefinitionV1ViewSet, basename="process-definition-v1"
)
router.register(
    "process-definition-versions-v1",
    ProcessDefinitionVersionV1ViewSet,
    basename="process-definition-version-v1",
)

urlpatterns = [
    path("", include(router.urls)),
]
