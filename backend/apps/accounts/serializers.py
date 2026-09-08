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
    """Slimmer shape for populating pickers (responsible person, etc.) —
    also doubles as the Operators Settings screen's row shape, hence the
    extra `team_name`/`designation`/`is_active` fields beyond what a picker
    strictly needs.
    """

    team_name = serializers.CharField(source="team.name", read_only=True, default=None)

    class Meta:
        model = Employee
        fields = [
            "id",
            "employee_code",
            "full_name",
            "team",
            "team_name",
            "designation",
            "is_active",
        ]


class EmployeeWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Employee
        fields = ["id", "employee_code", "full_name", "team", "designation", "is_active"]


def serialize_current_user(user: User) -> dict:
    """The shared shape returned by both POST /auth/login/ and GET /auth/me/."""

    employee = getattr(user, "employee", None)
    return {
        "id": user.id,
        "username": user.username,
        "roles": list(user.groups.values_list("name", flat=True)),
        "employee": EmployeeSerializer(employee).data if employee else None,
    }
