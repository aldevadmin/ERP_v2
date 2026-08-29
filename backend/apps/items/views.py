from django.db.models import QuerySet
from rest_framework import filters, mixins, viewsets
from rest_framework.permissions import BasePermission

from apps.core.mixins import ProtectedDestroyMixin

from .models import UOM, Item, ItemFieldRule, MaterialType, NamingTemplate, ProductType, Shape
from .permissions import CanManageItems, IsInternalStaff
from .serializers import (
    ItemFieldRuleSerializer,
    ItemSerializer,
    MaterialTypeSerializer,
    NamingTemplateSerializer,
    ProductTypeSerializer,
    ShapeSerializer,
    UOMSerializer,
)


class UOMViewSet(
    ProtectedDestroyMixin,
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """`is_active` is the usual deactivation mechanism; `destroy` is also
    available, blocked with a friendly error if any Item still uses this UOM.
    """

    queryset = UOM.objects.all()
    serializer_class = UOMSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ["name", "code"]

    def get_permissions(self) -> list[BasePermission]:
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [CanManageItems()]
        return [IsInternalStaff()]

    def get_queryset(self) -> QuerySet[UOM]:
        queryset = super().get_queryset()
        is_active = self.request.query_params.get("is_active")
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() in ("true", "1"))
        return queryset


class ProductTypeViewSet(
    ProtectedDestroyMixin,
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """`is_active` is the usual deactivation mechanism; `destroy` is also
    available, blocked with a friendly error if any Item still uses this type.
    """

    queryset = ProductType.objects.all()
    serializer_class = ProductTypeSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ["name"]

    def get_permissions(self) -> list[BasePermission]:
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [CanManageItems()]
        return [IsInternalStaff()]

    def get_queryset(self) -> QuerySet[ProductType]:
        queryset = super().get_queryset()
        is_active = self.request.query_params.get("is_active")
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() in ("true", "1"))
        return queryset


class MaterialTypeViewSet(
    ProtectedDestroyMixin,
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """`is_active` is the usual deactivation mechanism; `destroy` is also
    available, blocked with a friendly error if any Item still uses this type.
    """

    queryset = MaterialType.objects.all()
    serializer_class = MaterialTypeSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ["name"]

    def get_permissions(self) -> list[BasePermission]:
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [CanManageItems()]
        return [IsInternalStaff()]

    def get_queryset(self) -> QuerySet[MaterialType]:
        queryset = super().get_queryset()
        is_active = self.request.query_params.get("is_active")
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() in ("true", "1"))
        return queryset


class ShapeViewSet(
    ProtectedDestroyMixin,
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """`is_active` is the usual deactivation mechanism; `destroy` is also
    available, blocked with a friendly error if any Item still uses this shape.
    """

    queryset = Shape.objects.all()
    serializer_class = ShapeSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ["name"]

    def get_permissions(self) -> list[BasePermission]:
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [CanManageItems()]
        return [IsInternalStaff()]

    def get_queryset(self) -> QuerySet[Shape]:
        queryset = super().get_queryset()
        is_active = self.request.query_params.get("is_active")
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() in ("true", "1"))
        return queryset


class ItemFieldRuleViewSet(
    mixins.ListModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """No create/destroy — the 24 rows (one per item_class × field) are
    fixed and seeded by migration (see `0013_seed_item_field_rules`), never
    created or removed through the API. Only `state` is ever written, via
    the Item Classification settings screen."""

    queryset = ItemFieldRule.objects.all()
    serializer_class = ItemFieldRuleSerializer
    # Always exactly 24 rows (6 classes x 4 fields), never grows — a fixed
    # lookup table, not something that needs paging.
    pagination_class = None

    def get_permissions(self) -> list[BasePermission]:
        if self.action in ("update", "partial_update"):
            return [CanManageItems()]
        return [IsInternalStaff()]


class NamingTemplateViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """Unlike the other lookups in this app, nothing else references a
    `NamingTemplate` (it's read by the frontend to compute a suggestion,
    never stored against an Item), so plain delete is safe here without
    `ProtectedDestroyMixin`'s referenced-row check. `is_active` remains
    available too, for retiring one without losing its history.
    """

    queryset = NamingTemplate.objects.select_related("product_type")
    serializer_class = NamingTemplateSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ["item_class", "product_type__name"]

    def get_permissions(self) -> list[BasePermission]:
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [CanManageItems()]
        return [IsInternalStaff()]

    def get_queryset(self) -> QuerySet[NamingTemplate]:
        queryset = super().get_queryset()
        is_active = self.request.query_params.get("is_active")
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() in ("true", "1"))
        item_class = self.request.query_params.get("item_class")
        if item_class is not None:
            queryset = queryset.filter(item_class=item_class)
        return queryset


class ItemViewSet(
    ProtectedDestroyMixin,
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """`is_active` is the usual deactivation mechanism; `destroy` is also
    available for outright removal, blocked with a friendly error wherever
    this item is still referenced (Process inputs/outputs, Tooling
    compatibility/assignment, Product Route, Export Order line, ...).
    """

    queryset = Item.objects.select_related("product_type", "material_type", "inventory_uom")
    serializer_class = ItemSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ["code", "name"]

    def get_permissions(self) -> list[BasePermission]:
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [CanManageItems()]
        return [IsInternalStaff()]

    def get_queryset(self) -> QuerySet[Item]:
        queryset = super().get_queryset()

        is_active = self.request.query_params.get("is_active")
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() in ("true", "1"))

        item_class = self.request.query_params.get("item_class")
        if item_class is not None:
            queryset = queryset.filter(item_class=item_class)

        product_type = self.request.query_params.get("product_type")
        if product_type is not None:
            queryset = queryset.filter(product_type_id=product_type)

        material_type = self.request.query_params.get("material_type")
        if material_type is not None:
            queryset = queryset.filter(material_type_id=material_type)

        capability = self.request.query_params.get("capability")
        if capability in ("purchasable", "manufacturable", "stockable", "sellable"):
            queryset = queryset.filter(**{capability: True})

        return queryset
