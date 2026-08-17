from django.db.models import QuerySet
from rest_framework import filters, mixins, viewsets
from rest_framework.permissions import BasePermission
from rest_framework.serializers import BaseSerializer

from .models import Customer
from .permissions import CanManageCustomers, IsInternalStaff
from .serializers import CustomerListSerializer, CustomerSerializer


class CustomerViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """No delete route on purpose — `is_active` is the deactivation
    mechanism (see Customer model docstring); nothing needs a hard delete.
    """

    queryset = Customer.objects.all()
    filter_backends = [filters.SearchFilter]
    search_fields = ["code", "name"]

    def get_serializer_class(self) -> type[BaseSerializer]:
        if self.action == "list":
            return CustomerListSerializer
        return CustomerSerializer

    def get_permissions(self) -> list[BasePermission]:
        if self.action in ("create", "update", "partial_update"):
            return [CanManageCustomers()]
        return [IsInternalStaff()]

    def get_queryset(self) -> QuerySet[Customer]:
        queryset = super().get_queryset()

        is_active = self.request.query_params.get("is_active")
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() in ("true", "1"))

        return queryset
