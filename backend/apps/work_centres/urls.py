from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import WorkCentreViewSet

router = DefaultRouter()
router.register("work-centres", WorkCentreViewSet, basename="work-centre")

urlpatterns = [
    path("", include(router.urls)),
]
