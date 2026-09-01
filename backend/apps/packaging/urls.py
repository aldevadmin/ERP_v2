from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    PackagingProfileMaterialViewSet,
    PackagingProfileVersionViewSet,
    PackagingProfileViewSet,
)

router = DefaultRouter()
router.register("packaging-profiles", PackagingProfileViewSet, basename="packaging-profile")
router.register(
    "packaging-profile-versions",
    PackagingProfileVersionViewSet,
    basename="packaging-profile-version",
)
router.register(
    "packaging-profile-materials",
    PackagingProfileMaterialViewSet,
    basename="packaging-profile-material",
)

urlpatterns = [
    path("", include(router.urls)),
]
