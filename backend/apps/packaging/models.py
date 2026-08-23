from decimal import Decimal

from django.db import models

from apps.core.models import BaseModel


class PackagingProfile(BaseModel):
    """A reusable packaging configuration for a finished-good `Item` —
    pieces per pouch/carton, dimensions, weights. Stable identity; the
    actual configuration lives on `PackagingProfileVersion` below, same
    split as `processes.ProcessDefinition`/`ProcessDefinitionVersion` so a
    Customer Product Mapping (Phase 4) can pin to one immutable published
    version without a later edit here silently rewriting it.
    """

    class Scope(models.TextChoices):
        STANDARD = "STANDARD", "Standard"
        CUSTOMER_TEMPLATE = "CUSTOMER_TEMPLATE", "Customer Template"

    code = models.CharField(max_length=32, unique=True)
    name = models.CharField(max_length=255)
    finished_item = models.ForeignKey(
        "items.Item", on_delete=models.PROTECT, related_name="packaging_profiles"
    )
    scope = models.CharField(max_length=20, choices=Scope.choices, default=Scope.STANDARD)
    is_active = models.BooleanField(default=True)
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="packaging_profiles"
    )

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return f"{self.name} ({self.code})"

    def current_version(self) -> "PackagingProfileVersion | None":
        """The version the UI/API should read and write — the `PUBLISHED`
        one if there is one, otherwise the latest `DRAFT`/`RETIRED` row.
        """
        return (
            self.versions.filter(status=PackagingProfileVersion.Status.PUBLISHED).first()
            or self.versions.first()
        )


class PackagingProfileVersion(BaseModel):
    """One versioned configuration snapshot of a `PackagingProfile`. Only a
    `DRAFT` version may be edited — once `PUBLISHED`, a version is
    immutable (enforced in `views.py`), since a Customer Product Mapping
    pins to a specific published version and must never have its packaging
    facts silently reinterpreted. `RETIRED` marks a version superseded by a
    newer `PUBLISHED` one. `pieces_per_selling_unit` and `cbm` are derived
    from the other fields but persisted (not computed on read) so a
    published version's numbers are frozen at publish time even if, e.g.,
    the derivation formula itself later changes.
    """

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        PUBLISHED = "PUBLISHED", "Published"
        RETIRED = "RETIRED", "Retired"

    class PackMode(models.TextChoices):
        PIECE = "PIECE", "Piece"
        POUCH = "POUCH", "Pouch"
        CARTON = "CARTON", "Carton"
        OTHER = "OTHER", "Other"

    profile = models.ForeignKey(PackagingProfile, on_delete=models.CASCADE, related_name="versions")
    version_number = models.PositiveIntegerField()
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    effective_from = models.DateField(null=True, blank=True)
    effective_to = models.DateField(null=True, blank=True)

    selling_uom = models.ForeignKey(
        "items.UOM", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    pack_mode = models.CharField(max_length=10, choices=PackMode.choices, default=PackMode.PIECE)
    pieces_per_pouch = models.PositiveIntegerField(null=True, blank=True)
    pouches_per_carton = models.PositiveIntegerField(null=True, blank=True)

    carton_length_mm = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    carton_breadth_mm = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    carton_height_mm = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    carton_net_weight_kg = models.DecimalField(
        max_digits=8, decimal_places=2, null=True, blank=True
    )
    carton_gross_weight_kg = models.DecimalField(
        max_digits=8, decimal_places=2, null=True, blank=True
    )

    # Derived and frozen at publish time — see class docstring.
    pieces_per_selling_unit = models.PositiveIntegerField(null=True, blank=True)
    cbm = models.DecimalField(max_digits=10, decimal_places=4, null=True, blank=True)

    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="packaging_profile_versions"
    )

    class Meta:
        ordering = ["-version_number"]
        constraints = [
            models.UniqueConstraint(
                fields=["profile", "version_number"], name="unique_version_per_profile"
            )
        ]

    def __str__(self) -> str:
        return f"{self.profile.name} v{self.version_number} ({self.status})"

    def compute_pieces_per_selling_unit(self) -> int | None:
        if self.pack_mode == self.PackMode.CARTON:
            if self.pieces_per_pouch and self.pouches_per_carton:
                return self.pieces_per_pouch * self.pouches_per_carton
            return None
        if self.pack_mode == self.PackMode.POUCH:
            return self.pieces_per_pouch
        if self.pack_mode == self.PackMode.PIECE:
            return 1
        return None

    def compute_cbm(self) -> Decimal | None:
        """Carton volume in cubic metres, from mm dimensions. `None` when
        any dimension is missing — CBM isn't meaningful for a PIECE/POUCH
        selling unit with no carton configured.
        """
        dims = (self.carton_length_mm, self.carton_breadth_mm, self.carton_height_mm)
        if any(d is None for d in dims):
            return None
        length, breadth, height = dims
        cubic_mm = length * breadth * height  # type: ignore[operator]
        return (cubic_mm / Decimal("1000000000")).quantize(Decimal("0.0001"))


class PackagingProfileMaterial(BaseModel):
    """One packaging material (pouch, carton, label, ...) consumed by a
    `PackagingProfileVersion` — references `items.Item` filtered to
    `PACKAGING_MATERIAL` in the write serializer, same "reference the
    unified Item catalog, validate the bucket in the serializer" pattern
    used by `processes.ProcessInputDefinition`/`ProcessOutputDefinition`.
    """

    class Level(models.TextChoices):
        POUCH = "POUCH", "Pouch"
        CARTON = "CARTON", "Carton"
        PALLET = "PALLET", "Pallet"
        OTHER = "OTHER", "Other"

    version = models.ForeignKey(
        PackagingProfileVersion, on_delete=models.CASCADE, related_name="materials"
    )
    item = models.ForeignKey("items.Item", on_delete=models.PROTECT, related_name="+")
    level = models.CharField(max_length=10, choices=Level.choices)
    quantity = models.DecimalField(max_digits=10, decimal_places=3)
    uom = models.ForeignKey("items.UOM", on_delete=models.PROTECT, related_name="+")
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="packaging_profile_materials"
    )

    class Meta:
        ordering = ["level", "id"]

    def __str__(self) -> str:
        return f"{self.item.name} x{self.quantity} ({self.level})"
