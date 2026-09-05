from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import BayViewSet, WorkCentreTypeViewSet, WorkCentreViewSet

router = DefaultRouter()
router.register("work-centres", WorkCentreViewSet, basename="work-centre")
router.register("work-centre-types", WorkCentreTypeViewSet, basename="work-centre-type")
router.register("bays", BayViewSet, basename="bay")

urlpatterns = [
    path("", include(router.urls)),
]
