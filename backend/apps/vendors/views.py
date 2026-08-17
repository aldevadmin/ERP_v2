from rest_framework import filters, viewsets
from rest_framework.permissions import IsAuthenticated

from .models import Vendor
from .serializers import VendorSerializer


class VendorViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Vendor.objects.filter(is_active=True)
    serializer_class = VendorSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter]
    search_fields = ["code", "name"]
