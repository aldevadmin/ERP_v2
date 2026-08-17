import pytest
from django.contrib.auth import get_user_model

pytestmark = pytest.mark.django_db


def test_auth_user_model_is_the_custom_user():
    assert get_user_model().__name__ == "User"


def test_can_create_and_authenticate_a_user():
    User = get_user_model()

    user = User.objects.create_user(username="operator1", password="a-strong-password")

    assert user.pk is not None
    assert user.check_password("a-strong-password")
