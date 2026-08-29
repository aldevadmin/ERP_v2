from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    ItemFieldRuleViewSet,
    ItemViewSet,
    MaterialTypeViewSet,
    NamingTemplateViewSet,
    ProductTypeViewSet,
    ShapeViewSet,
    UOMViewSet,
)

router = DefaultRouter()
router.register("items", ItemViewSet, basename="item")
router.register("product-types", ProductTypeViewSet, basename="product-type")
router.register("material-types", MaterialTypeViewSet, basename="material-type")
router.register("shapes", ShapeViewSet, basename="shape")
router.register("uoms", UOMViewSet, basename="uom")
router.register("naming-templates", NamingTemplateViewSet, basename="naming-template")
router.register("item-field-rules", ItemFieldRuleViewSet, basename="item-field-rule")

urlpatterns = [
    path("", include(router.urls)),
]
