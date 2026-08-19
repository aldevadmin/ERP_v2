from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import ProcessCategoryViewSet, ProcessViewSet

router = DefaultRouter()
router.register("process-categories", ProcessCategoryViewSet, basename="process-category")
router.register("processes", ProcessViewSet, basename="process")

urlpatterns = [
    path("", include(router.urls)),
]
