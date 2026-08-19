import pytest
from django.db import IntegrityError, transaction

from apps.processes.models import ProcessCategory

pytestmark = pytest.mark.django_db


def test_name_must_be_unique(organization):
    ProcessCategory.objects.create(name="Production", organization=organization)

    with pytest.raises(IntegrityError), transaction.atomic():
        ProcessCategory.objects.create(name="Production", organization=organization)


def test_str_is_name(organization):
    category = ProcessCategory.objects.create(name="Quality", organization=organization)

    assert str(category) == "Quality"
