from typing import Any, cast

from django.db import transaction
from django.db.models import QuerySet
from rest_framework import filters, mixins, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import BasePermission
from rest_framework.request import Request
from rest_framework.response import Response

from apps.core.mixins import ProtectedDestroyMixin

from .models import PackagingProfile, PackagingProfileMaterial, PackagingProfileVersion
from .permissions import CanManagePackaging, IsInternalStaff
from .serializers import (
    PackagingProfileMaterialWriteSerializer,
    PackagingProfileSerializer,
    PackagingProfileVersionSerializer,
)

VERSION_BASICS_FIELDS = [
    "effective_from",
    "effective_to",
    "selling_uom",
    "pack_mode",
    "pieces_per_pouch",
    "pouches_per_carton",
    "carton_length_mm",
    "carton_breadth_mm",
    "carton_height_mm",
    "carton_net_weight_kg",
    "carton_gross_weight_kg",
]


class PackagingProfileViewSet(
    ProtectedDestroyMixin,
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """`is_active` is the usual deactivation mechanism; `destroy` is also
    available, blocked with a friendly error if a Customer Product Mapping
    still pins a version of this profile.
    """

    queryset = PackagingProfile.objects.select_related("finished_item").prefetch_related(
        "versions__materials__item", "versions__materials__uom", "versions__selling_uom"
    )
    serializer_class = PackagingProfileSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ["name", "code"]

    def get_permissions(self) -> list[BasePermission]:
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [CanManagePackaging()]
        return [IsInternalStaff()]

    def get_queryset(self) -> QuerySet[PackagingProfile]:
        queryset = super().get_queryset()

        is_active = self.request.query_params.get("is_active")
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() in ("true", "1"))

        scope = self.request.query_params.get("scope")
        if scope is not None:
            queryset = queryset.filter(scope=scope)

        finished_item = self.request.query_params.get("finished_item")
        if finished_item is not None:
            queryset = queryset.filter(finished_item_id=finished_item)

        return queryset


class PackagingProfileVersionViewSet(
    mixins.RetrieveModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet
):
    queryset = PackagingProfileVersion.objects.select_related(
        "profile", "selling_uom"
    ).prefetch_related("materials__item", "materials__uom")
    serializer_class = PackagingProfileVersionSerializer

    def get_permissions(self) -> list[BasePermission]:
        return [CanManagePackaging()]

    def perform_update(self, serializer: serializers.BaseSerializer[Any]) -> None:
        instance = cast(PackagingProfileVersion, serializer.instance)
        if instance.status != PackagingProfileVersion.Status.DRAFT:
            raise serializers.ValidationError({"detail": "Only a draft version can be edited."})
        serializer.save()

    @action(detail=True, methods=["patch"])
    def materials(self, request: Request, pk: str | None = None) -> Response:
        version = self.get_object()
        if version.status != PackagingProfileVersion.Status.DRAFT:
            raise serializers.ValidationError({"detail": "Only a draft version can be edited."})

        data = cast(dict[str, Any], request.data)
        rows_serializer = PackagingProfileMaterialWriteSerializer(
            data=data.get("materials", []), many=True
        )
        rows_serializer.is_valid(raise_exception=True)

        with transaction.atomic():
            keep_ids = [row["id"] for row in rows_serializer.validated_data if row.get("id")]
            version.materials.exclude(id__in=keep_ids).delete()
            for row in rows_serializer.validated_data:
                row_id = row.get("id")
                defaults = {
                    "item": row["item"],
                    "level": row["level"],
                    "quantity": row["quantity"],
                    "uom": row["uom"],
                    "organization": version.organization,
                }
                if row_id:
                    PackagingProfileMaterial.objects.filter(id=row_id, version=version).update(
                        **defaults
                    )
                else:
                    PackagingProfileMaterial.objects.create(version=version, **defaults)

        version.refresh_from_db()
        return Response(self.get_serializer(version).data)

    @action(detail=True, methods=["post"])
    def publish(self, request: Request, pk: str | None = None) -> Response:
        version = self.get_object()

        with transaction.atomic():
            # Lock the parent profile so two concurrent publish calls for
            # different draft versions of the same profile can't both pass
            # the DRAFT check and both end up PUBLISHED.
            PackagingProfile.objects.select_for_update().get(pk=version.profile_id)
            version.refresh_from_db()
            if version.status != PackagingProfileVersion.Status.DRAFT:
                raise serializers.ValidationError(
                    {"detail": "Only a draft version can be published."}
                )

            errors: list[str] = []
            if version.selling_uom_id is None:
                errors.append("Selling UOM is required.")
            pieces_per_selling_unit = version.compute_pieces_per_selling_unit()
            if pieces_per_selling_unit is None:
                errors.append("Pack mode configuration is incomplete.")
            if not version.materials.exists():
                errors.append("At least one packaging material is required.")
            if errors:
                raise serializers.ValidationError({"detail": " • ".join(errors)})

            version.profile.versions.filter(status=PackagingProfileVersion.Status.PUBLISHED).update(
                status=PackagingProfileVersion.Status.RETIRED
            )
            version.pieces_per_selling_unit = pieces_per_selling_unit
            version.cbm = version.compute_cbm()
            version.status = PackagingProfileVersion.Status.PUBLISHED
            version.save(update_fields=["pieces_per_selling_unit", "cbm", "status", "updated_at"])

        return Response(self.get_serializer(version).data)

    @action(detail=True, methods=["post"], url_path="new-draft")
    def new_draft(self, request: Request, pk: str | None = None) -> Response:
        """Clones this (published) version's fields and materials into a
        new `DRAFT` version under the same profile — editing a published
        profile means creating this successor, never mutating the
        published row in place. Modeled on
        `processes.ProcessDefinitionViewSet.duplicate()`'s deep-copy, but
        scoped to "new version, same parent" instead of "new parent."
        """
        source = self.get_object()

        with transaction.atomic():
            # Lock the parent profile so two concurrent new-draft calls
            # can't both compute the same next version_number.
            PackagingProfile.objects.select_for_update().get(pk=source.profile_id)
            next_number = (source.profile.versions.first().version_number or 0) + 1
            new_version = PackagingProfileVersion.objects.create(
                profile=source.profile,
                version_number=next_number,
                status=PackagingProfileVersion.Status.DRAFT,
                effective_from=source.effective_from,
                effective_to=source.effective_to,
                selling_uom=source.selling_uom,
                pack_mode=source.pack_mode,
                pieces_per_pouch=source.pieces_per_pouch,
                pouches_per_carton=source.pouches_per_carton,
                carton_length_mm=source.carton_length_mm,
                carton_breadth_mm=source.carton_breadth_mm,
                carton_height_mm=source.carton_height_mm,
                carton_net_weight_kg=source.carton_net_weight_kg,
                carton_gross_weight_kg=source.carton_gross_weight_kg,
                organization=source.organization,
            )
            for material in source.materials.all():
                PackagingProfileMaterial.objects.create(
                    version=new_version,
                    item=material.item,
                    level=material.level,
                    quantity=material.quantity,
                    uom=material.uom,
                    organization=material.organization,
                )

        return Response(self.get_serializer(new_version).data, status=201)
