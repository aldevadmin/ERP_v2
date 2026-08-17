import pytest
from django.db import IntegrityError, transaction

from apps.products.models import Product

pytestmark = pytest.mark.django_db


def test_sku_code_must_be_unique(organization):
    Product.objects.create(
        sku_code="SKU-1", name="Areca Plate", base_unit="Piece", organization=organization
    )

    with pytest.raises(IntegrityError), transaction.atomic():
        Product.objects.create(
            sku_code="SKU-1", name="Duplicate", base_unit="Piece", organization=organization
        )


def test_str_includes_sku_code(organization):
    product = Product.objects.create(
        sku_code="SKU-2", name="Areca Plate", base_unit="Piece", organization=organization
    )

    assert str(product) == "Areca Plate (SKU-2)"
