from datetime import date
from typing import Any, cast

from django.db import transaction
from django.db.models import QuerySet
from django.shortcuts import get_object_or_404
from rest_framework import filters, mixins, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import BasePermission
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.serializers import BaseSerializer

from apps.core.mixins import ProtectedDestroyMixin

from .models import (
    CustomerProductMapping,
    CustomerProductMappingVersion,
    MappingFile,
    MappingRequirement,
)
from .permissions import CanManageMappings, IsInternalStaff
from .serializers import (
    CustomerProductMappingSerializer,
    CustomerProductMappingVersionSerializer,
    MappingFileSerializer,
    MappingRequirementWriteSerializer,
)
from .services import resolve_customer_product


class CustomerProductMappingViewSet(
    ProtectedDestroyMixin,
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    queryset = CustomerProductMapping.objects.select_related("customer", "item").prefetch_related(
        "versions__requirements", "versions__files", "versions__packaging_profile_version__profile"
    )
    serializer_class = CustomerProductMappingSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ["mapping_code", "customer_sku", "customer__name", "item__name", "item__code"]

    def get_permissions(self) -> list[BasePermission]:
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [CanManageMappings()]
        return [IsInternalStaff()]

    def get_queryset(self) -> QuerySet[CustomerProductMapping]:
        queryset = super().get_queryset()

        is_active = self.request.query_params.get("is_active")
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() in ("true", "1"))

        customer = self.request.query_params.get("customer")
        if customer is not None:
            queryset = queryset.filter(customer_id=customer)

        item = self.request.query_params.get("item")
        if item is not None:
            queryset = queryset.filter(item_id=item)

        # Reverse lookup for the Packaging Profile form's "Used By
        # Customers" card — every mapping with any version pinned to any
        # version of this profile, mirroring `items` view's own `?item=`
        # (any version, not just each mapping's current one — same
        # simplicity tradeoff as `PackagingProfileMaterialViewSet`'s
        # `?item=` reverse lookup).
        packaging_profile = self.request.query_params.get("packaging_profile")
        if packaging_profile is not None:
            queryset = queryset.filter(
                versions__packaging_profile_version__profile_id=packaging_profile
            ).distinct()

        return queryset

    def perform_update(self, serializer: serializers.BaseSerializer[Any]) -> None:
        instance = cast(CustomerProductMapping, serializer.instance)
        new_sku = serializer.validated_data.get("customer_sku")
        if new_sku is not None and new_sku != instance.customer_sku:
            raise serializers.ValidationError(
                {
                    "customer_sku": (
                        "Customer SKU can't be changed after the mapping is created. "
                        "Create a new mapping instead."
                    )
                }
            )
        serializer.save()

    @action(detail=False, methods=["get"])
    def resolve(self, request: Request) -> Response:
        """Backs the Export Order Add-Product flow (Phase 5) and the
        Mapping Preview screen — the one place resolution happens, per
        `services.resolve_customer_product`. Resolved by `customer_sku`
        (the mapping's real identity), not `item` — a customer can have
        several simultaneous mappings against the same item.
        """
        customer_id = request.query_params.get("customer")
        customer_sku = request.query_params.get("customer_sku")
        if not customer_id or not customer_sku:
            raise serializers.ValidationError({"detail": "customer and customer_sku are required."})
        as_of_raw = request.query_params.get("as_of")
        as_of = date.fromisoformat(as_of_raw) if as_of_raw else None
        version = resolve_customer_product(int(customer_id), customer_sku, as_of)
        if version is None:
            return Response(
                {
                    "detail": (
                        "No published, currently-effective mapping exists for this "
                        "customer and item."
                    )
                },
                status=404,
            )
        return Response(CustomerProductMappingVersionSerializer(version).data)


class CustomerProductMappingVersionViewSet(
    mixins.RetrieveModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet
):
    queryset = CustomerProductMappingVersion.objects.select_related(
        "mapping__customer", "mapping__item", "selling_uom", "packaging_profile_version__profile"
    ).prefetch_related("requirements", "files")
    serializer_class = CustomerProductMappingVersionSerializer

    def get_permissions(self) -> list[BasePermission]:
        return [CanManageMappings()]

    def perform_update(self, serializer: serializers.BaseSerializer[Any]) -> None:
        instance = cast(CustomerProductMappingVersion, serializer.instance)
        if instance.status != CustomerProductMappingVersion.Status.DRAFT:
            raise serializers.ValidationError({"detail": "Only a draft version can be edited."})
        serializer.save()

    @action(detail=True, methods=["patch"])
    def requirements(self, request: Request, pk: str | None = None) -> Response:
        version = self.get_object()
        if version.status != CustomerProductMappingVersion.Status.DRAFT:
            raise serializers.ValidationError({"detail": "Only a draft version can be edited."})

        data = cast(dict[str, Any], request.data)
        rows_serializer = MappingRequirementWriteSerializer(
            data=data.get("requirements", []), many=True
        )
        rows_serializer.is_valid(raise_exception=True)

        with transaction.atomic():
            keep_ids = [row["id"] for row in rows_serializer.validated_data if row.get("id")]
            version.requirements.exclude(id__in=keep_ids).delete()
            for row in rows_serializer.validated_data:
                row_id = row.get("id")
                defaults = {
                    "category": row["category"],
                    "key": row["key"],
                    "value": row["value"],
                    "is_required": row["is_required"],
                    "sort_order": row["sort_order"],
                    "organization": version.organization,
                }
                if row_id:
                    MappingRequirement.objects.filter(id=row_id, version=version).update(**defaults)
                else:
                    MappingRequirement.objects.create(version=version, **defaults)

        version.refresh_from_db()
        return Response(self.get_serializer(version).data)

    @action(detail=True, methods=["post"])
    def publish(self, request: Request, pk: str | None = None) -> Response:
        version = self.get_object()

        with transaction.atomic():
            # Lock the parent mapping so two concurrent publish calls for
            # different draft versions of the same mapping can't both pass
            # the DRAFT check and both end up PUBLISHED.
            CustomerProductMapping.objects.select_for_update().get(pk=version.mapping_id)
            version.refresh_from_db()
            if version.status != CustomerProductMappingVersion.Status.DRAFT:
                raise serializers.ValidationError(
                    {"detail": "Only a draft version can be published."}
                )

            errors: list[str] = []
            if version.packaging_profile_version_id is None:
                errors.append("A published packaging profile version is required.")
            if version.selling_uom_id is None:
                errors.append("Selling UOM is required.")
            if errors:
                raise serializers.ValidationError({"detail": " • ".join(errors)})

            version.mapping.versions.filter(
                status=CustomerProductMappingVersion.Status.PUBLISHED
            ).update(status=CustomerProductMappingVersion.Status.RETIRED)
            version.status = CustomerProductMappingVersion.Status.PUBLISHED
            version.save(update_fields=["status", "updated_at"])

        return Response(self.get_serializer(version).data)

    @action(detail=True, methods=["post"], url_path="new-draft")
    def new_draft(self, request: Request, pk: str | None = None) -> Response:
        """Clones this (published) version's fields, requirements, and
        files into a new `DRAFT` version under the same mapping — same
        "new version, same parent" mechanic as
        `packaging.PackagingProfileVersionViewSet.new_draft`.
        """
        source = self.get_object()

        with transaction.atomic():
            # Lock the parent mapping so two concurrent new-draft calls
            # can't both compute the same next version_number.
            CustomerProductMapping.objects.select_for_update().get(pk=source.mapping_id)
            next_number = (source.mapping.versions.first().version_number or 0) + 1
            new_version = CustomerProductMappingVersion.objects.create(
                mapping=source.mapping,
                version_number=next_number,
                status=CustomerProductMappingVersion.Status.DRAFT,
                effective_from=source.effective_from,
                effective_to=source.effective_to,
                customer_description=source.customer_description,
                packaging_profile_version=source.packaging_profile_version,
                selling_uom=source.selling_uom,
                unit_price=source.unit_price,
                currency=source.currency,
                barcode=source.barcode,
                organization=source.organization,
            )
            for requirement in source.requirements.all():
                MappingRequirement.objects.create(
                    version=new_version,
                    category=requirement.category,
                    key=requirement.key,
                    value=requirement.value,
                    is_required=requirement.is_required,
                    sort_order=requirement.sort_order,
                    organization=requirement.organization,
                )

        return Response(self.get_serializer(new_version).data, status=201)


class MappingFileViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """No update route — replacing a file is delete-then-reupload, same
    philosophy as `products.CustomerSKUMappingFileViewSet`.
    """

    serializer_class = MappingFileSerializer
    lookup_url_kwarg = "file_pk"

    def get_permissions(self) -> list[BasePermission]:
        if self.action in ("create", "destroy"):
            return [CanManageMappings()]
        return [IsInternalStaff()]

    def get_mapping_version(self) -> CustomerProductMappingVersion:
        return get_object_or_404(
            CustomerProductMappingVersion, pk=self.kwargs["mapping_version_pk"]
        )

    def get_queryset(self) -> QuerySet[MappingFile]:
        queryset = MappingFile.objects.filter(version_id=self.kwargs["mapping_version_pk"])

        category = self.request.query_params.get("category")
        if category:
            queryset = queryset.filter(category=category)

        return queryset

    def get_serializer_context(self) -> dict[str, Any]:
        context = dict(super().get_serializer_context())
        context["mapping_version"] = self.get_mapping_version()
        return context

    def perform_create(self, serializer: BaseSerializer) -> None:
        serializer.save(created_by=self.request.user, updated_by=self.request.user)
