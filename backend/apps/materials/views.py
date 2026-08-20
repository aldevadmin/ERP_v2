from django.db.models import QuerySet
from rest_framework import filters, mixins, viewsets
from rest_framework.permissions import BasePermission

from .models import Material
from .permissions import CanManageMaterials, IsInternalStaff
from .serializers import MaterialSerializer


class MaterialViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """No delete route on purpose — `is_active` is the deactivation
    mechanism, same as `apps.products.views.ProductViewSet`.
    """

    queryset = Material.objects.all()
    serializer_class = MaterialSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ["code", "name"]

    def get_permissions(self) -> list[BasePermission]:
        if self.action in ("create", "update", "partial_update"):
            return [CanManageMaterials()]
        return [IsInternalStaff()]

    def get_queryset(self) -> QuerySet[Material]:
        queryset = super().get_queryset()

        is_active = self.request.query_params.get("is_active")
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() in ("true", "1"))

        category = self.request.query_params.get("category")
        if category is not None:
            queryset = queryset.filter(category=category)

        return queryset
