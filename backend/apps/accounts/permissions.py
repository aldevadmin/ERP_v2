from rest_framework.permissions import BasePermission
from rest_framework.request import Request
from rest_framework.views import APIView


def HasAnyRole(*role_names: str) -> type[BasePermission]:
    """DRF permission class factory: allow only authenticated users who
    belong to at least one of the given role groups.

    This is the one mechanism every module — this one and every future
    one — uses to gate an action by role:

        permission_classes = [HasAnyRole("Export Coordinator", "Manager/Admin")]

    Role names are Django Group names (see the seed migration), not a
    separate permissions concept — there is nothing else to keep in sync.
    """

    class _HasAnyRole(BasePermission):
        def has_permission(self, request: Request, view: APIView) -> bool:
            user = request.user
            return bool(
                user
                and user.is_authenticated
                and user.groups.filter(name__in=role_names).exists()
            )

    return _HasAnyRole
