from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import ItemViewSet, MaterialTypeViewSet, ProductTypeViewSet, UOMViewSet

router = DefaultRouter()
router.register("items", ItemViewSet, basename="item")
router.register("product-types", ProductTypeViewSet, basename="product-type")
router.register("material-types", MaterialTypeViewSet, basename="material-type")
router.register("uoms", UOMViewSet, basename="uom")

urlpatterns = [
    path("", include(router.urls)),
]
