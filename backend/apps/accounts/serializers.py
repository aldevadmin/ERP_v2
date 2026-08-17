from rest_framework import serializers

from apps.core.models import Organization

from .models import Employee, Team, User


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(trim_whitespace=False, style={"input_type": "password"})


class TeamSerializer(serializers.ModelSerializer):
    class Meta:
        model = Team
        fields = ["id", "name"]


class OrganizationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = ["id", "name"]


class EmployeeSerializer(serializers.ModelSerializer):
    """Full employee shape — used for the current user's own profile."""

    team = TeamSerializer(read_only=True)
    organization = OrganizationSerializer(read_only=True)

    class Meta:
        model = Employee
        fields = ["employee_code", "full_name", "designation", "team", "organization"]


class EmployeeListSerializer(serializers.ModelSerializer):
    """Slimmer shape for populating pickers (responsible person, etc.)."""

    class Meta:
        model = Employee
        fields = ["id", "employee_code", "full_name", "team"]


def serialize_current_user(user: User) -> dict:
    """The shared shape returned by both POST /auth/login/ and GET /auth/me/."""

    employee = getattr(user, "employee", None)
    return {
        "id": user.id,
        "username": user.username,
        "roles": list(user.groups.values_list("name", flat=True)),
        "employee": EmployeeSerializer(employee).data if employee else None,
    }
