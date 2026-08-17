import pytest
from django.db import IntegrityError, transaction

from apps.accounts.models import Employee
from apps.customers.models import Customer, CustomerAddress

pytestmark = pytest.mark.django_db


def test_customer_code_must_be_unique(organization):
    Customer.objects.create(code="CUST-1", name="Acme", organization=organization)

    with pytest.raises(IntegrityError), transaction.atomic():
        Customer.objects.create(code="CUST-1", name="Acme Duplicate", organization=organization)


def test_customer_str_includes_code(organization):
    customer = Customer.objects.create(code="CUST-2", name="Acme", organization=organization)

    assert str(customer) == "Acme (CUST-2)"


def test_customer_defaults_for_new_fields(organization):
    customer = Customer.objects.create(code="CUST-3", name="Acme", organization=organization)

    assert customer.main_poc == ""
    assert customer.emails == []
    assert customer.phone_numbers == []
    assert customer.internal_coordinator is None


def test_customer_stores_multiple_emails_and_phone_numbers(organization):
    customer = Customer.objects.create(
        code="CUST-4",
        name="Acme",
        organization=organization,
        emails=["ops@acme.com", "billing@acme.com"],
        phone_numbers=["+1-555-1000", "+1-555-2000"],
    )
    customer.refresh_from_db()

    assert customer.emails == ["ops@acme.com", "billing@acme.com"]
    assert customer.phone_numbers == ["+1-555-1000", "+1-555-2000"]


def test_customer_internal_coordinator_set_null_on_employee_delete(organization):
    employee = Employee.objects.create(
        employee_code="E1", full_name="Asha Rao", organization=organization
    )
    customer = Customer.objects.create(
        code="CUST-5", name="Acme", organization=organization, internal_coordinator=employee
    )

    employee.delete()
    customer.refresh_from_db()

    assert customer.internal_coordinator is None


def test_address_cascades_on_customer_delete(organization):
    customer = Customer.objects.create(code="CUST-6", name="Acme", organization=organization)
    CustomerAddress.objects.create(
        customer=customer,
        address_type=CustomerAddress.AddressType.BILLING,
        line1="1 Main St",
        country="USA",
    )

    customer.delete()

    assert CustomerAddress.objects.count() == 0


def test_address_str_includes_type_and_line1():
    address = CustomerAddress(
        address_type=CustomerAddress.AddressType.SHIPPING,
        line1="1 Main St",
        country="USA",
    )

    assert str(address) == "Shipping — 1 Main St"


def test_address_supports_three_lines_and_pin(organization):
    customer = Customer.objects.create(code="CUST-7", name="Acme", organization=organization)
    address = CustomerAddress.objects.create(
        customer=customer,
        address_type=CustomerAddress.AddressType.BILLING_AND_SHIPPING,
        country="USA",
        state="New York",
        line1="Add 1",
        line2="Add 2",
        line3="Add 3",
        pin="91000",
    )

    assert address.line3 == "Add 3"
    assert address.pin == "91000"
    assert address.address_type == "BILLING_AND_SHIPPING"
