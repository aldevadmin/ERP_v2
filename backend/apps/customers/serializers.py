from typing import Any

from rest_framework import serializers

from apps.accounts.serializers import EmployeeListSerializer
from apps.core.models import Organization

from .models import Customer, CustomerAddress


class CustomerAddressSerializer(serializers.ModelSerializer):
    # Writable, not the default read-only PK field: present on an existing
    # address row so the parent serializer's upsert can match it; absent on
    # a newly added row.
    id = serializers.IntegerField(required=False)

    class Meta:
        model = CustomerAddress
        fields = [
            "id",
            "address_type",
            "country",
            "state",
            "line1",
            "line2",
            "line3",
            "pin",
        ]


class CustomerListSerializer(serializers.ModelSerializer):
    """Slim shape for the list screen — no nested addresses."""

    internal_coordinator_detail = EmployeeListSerializer(
        source="internal_coordinator", read_only=True
    )

    class Meta:
        model = Customer
        fields = [
            "id",
            "code",
            "name",
            "main_poc",
            "internal_coordinator",
            "internal_coordinator_detail",
            "is_active",
        ]


class CustomerSerializer(serializers.ModelSerializer):
    """Full shape for detail/create/edit — addresses are written in the same
    call as the customer itself (see `_sync_addresses`), matching the
    Create/Edit screen being one form, not a separate address manager.
    """

    addresses = CustomerAddressSerializer(many=True, required=False)
    internal_coordinator_detail = EmployeeListSerializer(
        source="internal_coordinator", read_only=True
    )

    class Meta:
        model = Customer
        fields = [
            "id",
            "code",
            "name",
            "main_poc",
            "emails",
            "phone_numbers",
            "internal_coordinator",
            "internal_coordinator_detail",
            "is_active",
            "addresses",
        ]

    def create(self, validated_data: dict[str, Any]) -> Customer:
        addresses_data = validated_data.pop("addresses", [])
        customer = Customer.objects.create(
            organization=Organization.get_default(), **validated_data
        )
        self._sync_addresses(customer, addresses_data)
        return customer

    def update(self, instance: Customer, validated_data: dict[str, Any]) -> Customer:
        addresses_data = validated_data.pop("addresses", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if addresses_data is not None:
            self._sync_addresses(instance, addresses_data)

        return instance

    @staticmethod
    def _sync_addresses(customer: Customer, addresses_data: list[dict[str, Any]]) -> None:
        """Upsert-by-id, then drop any address no longer in the payload."""
        submitted_ids: set[int] = set()
        for address_data in addresses_data:
            address_id = address_data.pop("id", None)
            if address_id is not None:
                updated = CustomerAddress.objects.filter(
                    id=address_id, customer=customer
                ).update(**address_data)
                if updated:
                    submitted_ids.add(address_id)
                    continue
            new_address = CustomerAddress.objects.create(customer=customer, **address_data)
            submitted_ids.add(new_address.id)
        customer.addresses.exclude(id__in=submitted_ids).delete()
