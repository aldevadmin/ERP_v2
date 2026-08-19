import pytest
from django.db import IntegrityError, transaction

from apps.materials.models import Material

pytestmark = pytest.mark.django_db


def test_code_must_be_unique(organization):
    Material.objects.create(code="MAT-1", name="Raw Leaf", unit="Kg", organization=organization)

    with pytest.raises(IntegrityError), transaction.atomic():
        Material.objects.create(
            code="MAT-1", name="Duplicate", unit="Kg", organization=organization
        )


def test_str_includes_code(organization):
    material = Material.objects.create(
        code="MAT-2", name="Raw Leaf", unit="Kg", organization=organization
    )

    assert str(material) == "Raw Leaf (MAT-2)"
