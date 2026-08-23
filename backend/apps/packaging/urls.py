from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import PackagingProfileVersionViewSet, PackagingProfileViewSet

router = DefaultRouter()
router.register("packaging-profiles", PackagingProfileViewSet, basename="packaging-profile")
router.register(
    "packaging-profile-versions",
    PackagingProfileVersionViewSet,
    basename="packaging-profile-version",
)

urlpatterns = [
    path("", include(router.urls)),
]
