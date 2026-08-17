from django.conf import settings
from django.db import models, transaction


class BaseModel(models.Model):
    """Common audit fields every domain model gets, across every app.

    created_by/updated_by are set explicitly by the caller (e.g.
    `serializer.save(created_by=request.user)`), not auto-populated via
    middleware — keeps the mechanism obvious rather than implicit.
    """

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        related_name="+",
        on_delete=models.SET_NULL,
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        related_name="+",
        on_delete=models.SET_NULL,
    )

    class Meta:
        abstract = True


class Organization(BaseModel):
    """The company operating this ERP instance.

    V1 is single-organization: exactly one row is seeded by migration and
    there is no multi-tenant switching. The field exists on dependent models
    (Employee, Team) now so a genuine multi-org need later doesn't require
    retrofitting every table that should have been org-scoped from the start.
    """

    name = models.CharField(max_length=255, unique=True)

    class Meta:
        verbose_name = "Organization"
        verbose_name_plural = "Organizations"

    def __str__(self) -> str:
        return self.name

    @classmethod
    def get_default(cls) -> "Organization":
        """The single organization every V1 record is scoped to.

        V1 is single-org; this is the one place that assumption lives, so
        a genuine multi-org need later only has to change this method.
        """
        organization = cls.objects.order_by("id").first()
        if organization is None:
            raise cls.DoesNotExist("No Organization exists — run migrations.")
        return organization


class Sequence(models.Model):
    """A named, atomically-incrementing counter for document numbering
    (Export Order numbers, and later Shipment numbers, etc.) — not exposed
    via any API, used only through `next_value()`.
    """

    key = models.CharField(max_length=64, unique=True)
    last_value = models.PositiveIntegerField(default=0)

    def __str__(self) -> str:
        return f"{self.key} = {self.last_value}"

    @classmethod
    def next_value(cls, key: str) -> int:
        with transaction.atomic():
            seq, _ = cls.objects.select_for_update().get_or_create(key=key)
            seq.last_value += 1
            seq.save(update_fields=["last_value"])
            return seq.last_value
