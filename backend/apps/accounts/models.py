from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.db import models

from apps.core.models import BaseModel


class User(AbstractUser):
    """Custom user model with no extra fields yet.

    Set as AUTH_USER_MODEL from the first migration so it never has to change
    later — extending this model is cheap, swapping AUTH_USER_MODEL after
    the fact is not. Role/employee/permission fields land here as
    Export Order Management (and later modules) need them.

    Roles are Django Groups (see the seed migration), not a field here —
    membership is checked via `apps.accounts.permissions.HasAnyRole`.
    """


class Team(BaseModel):
    """A department/team, e.g. Export, Production, Procurement, Packing,
    Logistics — whatever the organization actually uses. Deliberately not a
    fixed choice list: which teams exist is data, not code, so this stays
    reusable for departments future modules (HR, Finance, ...) introduce.
    """

    name = models.CharField(max_length=100, unique=True)
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="teams"
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class Employee(BaseModel):
    """An organization's employee. Not every employee has a login (many
    factory-floor staff are never expected to use the system directly —
    coordinators enter data on their behalf), and employee records can
    predate a login being created — hence `user` is nullable, not the
    anchor. `organization` is independent of `team` (not derived through
    it) because `team` is optional: org-awareness must hold even before a
    team is assigned.
    """

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        related_name="employee",
        on_delete=models.SET_NULL,
    )
    employee_code = models.CharField(max_length=32, unique=True)
    full_name = models.CharField(max_length=255)
    organization = models.ForeignKey(
        "core.Organization", on_delete=models.PROTECT, related_name="employees"
    )
    team = models.ForeignKey(
        Team, null=True, blank=True, related_name="employees", on_delete=models.SET_NULL
    )
    designation = models.CharField(max_length=100, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["full_name"]

    def __str__(self) -> str:
        return f"{self.full_name} ({self.employee_code})"
