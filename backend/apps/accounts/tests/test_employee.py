import pytest
from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction

from apps.accounts.models import Employee

pytestmark = pytest.mark.django_db

User = get_user_model()


def test_employee_can_exist_without_a_linked_user(organization):
    employee = Employee.objects.create(
        employee_code="EMP100", full_name="Pre-provisioned Employee", organization=organization
    )

    assert employee.user is None


def test_employee_code_must_be_unique(organization):
    Employee.objects.create(employee_code="EMP200", full_name="A", organization=organization)

    with pytest.raises(IntegrityError), transaction.atomic():
        Employee.objects.create(employee_code="EMP200", full_name="B", organization=organization)


def test_a_user_can_only_have_one_employee(organization):
    user = User.objects.create_user(username="op2", password="x")
    Employee.objects.create(
        user=user, employee_code="EMP300", full_name="A", organization=organization
    )

    with pytest.raises(IntegrityError), transaction.atomic():
        Employee.objects.create(
            user=user, employee_code="EMP301", full_name="B", organization=organization
        )


def test_employee_team_is_optional(organization):
    employee = Employee.objects.create(
        employee_code="EMP400", full_name="No Team Yet", organization=organization
    )

    assert employee.team is None


def test_user_employee_reverse_accessor(organization):
    user = User.objects.create_user(username="op3", password="x")
    employee = Employee.objects.create(
        user=user, employee_code="EMP500", full_name="Linked", organization=organization
    )

    assert user.employee == employee
