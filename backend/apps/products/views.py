from typing import Any

from django.db.models import QuerySet
from django.shortcuts import get_object_or_404
from rest_framework import filters, mixins, viewsets
from rest_framework.permissions import BasePermission
from rest_framework.serializers import BaseSerializer

from .models import CustomerSKUMapping, CustomerSKUMappingFile, Product
from .permissions import CanManageProducts, IsInternalStaff
from .serializers import (
    CustomerSKUMappingFileSerializer,
    CustomerSKUMappingSerializer,
    ProductSerializer,
)


class ProductViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """No delete route on purpose — `is_active` is the deactivation
    mechanism, same as `apps.customers.views.CustomerViewSet`.
    """

    queryset = Product.objects.all()
    serializer_class = ProductSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ["sku_code", "name"]

    def get_permissions(self) -> list[BasePermission]:
        if self.action in ("create", "update", "partial_update"):
            return [CanManageProducts()]
        return [IsInternalStaff()]

    def get_queryset(self) -> QuerySet[Product]:
        queryset = super().get_queryset()

        is_active = self.request.query_params.get("is_active")
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() in ("true", "1"))

        return queryset


class CustomerSKUMappingViewSet(viewsets.ModelViewSet):
    """Full CRUD, including delete — a correctable lookup row, not an
    identity record (see the model docstring).
    """

    queryset = CustomerSKUMapping.objects.select_related("customer", "product").prefetch_related(
        "files"
    )
    serializer_class = CustomerSKUMappingSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ["customer_sku_code", "customer_description"]

    def get_permissions(self) -> list[BasePermission]:
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [CanManageProducts()]
        return [IsInternalStaff()]

    def get_queryset(self) -> QuerySet[CustomerSKUMapping]:
        queryset = super().get_queryset()

        customer_id = self.request.query_params.get("customer")
        if customer_id:
            queryset = queryset.filter(customer_id=customer_id)

        return queryset


class CustomerSKUMappingFileViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """Reference images/files for a Customer SKU packing configuration.

    No update route — replacing a file is delete-then-reupload, same
    correctable-lookup-row philosophy as `CustomerSKUMappingViewSet` itself.
    """

    serializer_class = CustomerSKUMappingFileSerializer
    lookup_url_kwarg = "file_pk"

    def get_permissions(self) -> list[BasePermission]:
        if self.action in ("create", "destroy"):
            return [CanManageProducts()]
        return [IsInternalStaff()]

    def get_customer_sku_mapping(self) -> CustomerSKUMapping:
        return get_object_or_404(
            CustomerSKUMapping, pk=self.kwargs["customer_sku_mapping_pk"]
        )

    def get_queryset(self) -> QuerySet[CustomerSKUMappingFile]:
        queryset = CustomerSKUMappingFile.objects.filter(
            customer_sku_mapping_id=self.kwargs["customer_sku_mapping_pk"]
        )

        category = self.request.query_params.get("category")
        if category:
            queryset = queryset.filter(category=category)

        return queryset

    def get_serializer_context(self) -> dict[str, Any]:
        context = dict(super().get_serializer_context())
        context["customer_sku_mapping"] = self.get_customer_sku_mapping()
        return context

    def perform_create(self, serializer: BaseSerializer) -> None:
        serializer.save(created_by=self.request.user, updated_by=self.request.user)
