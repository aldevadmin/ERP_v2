from typing import cast

from django.contrib.auth import authenticate, login, logout
from django.db.models import QuerySet
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import filters, status, viewsets
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Employee, Team, User
from .serializers import (
    EmployeeListSerializer,
    LoginSerializer,
    TeamSerializer,
    serialize_current_user,
)


class CsrfView(APIView):
    """GET once on app boot so the csrftoken cookie exists before any POST."""

    permission_classes = [AllowAny]

    @method_decorator(ensure_csrf_cookie)
    def get(self, request: Request) -> Response:
        return Response(status=status.HTTP_204_NO_CONTENT)


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request: Request) -> Response:
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = authenticate(
            request,
            username=serializer.validated_data["username"],
            password=serializer.validated_data["password"],
        )
        if user is None:
            return Response(
                {"detail": "Invalid credentials."}, status=status.HTTP_401_UNAUTHORIZED
            )

        login(request, user)
        return Response(serialize_current_user(user))


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request: Request) -> Response:
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        # IsAuthenticated guarantees this at runtime; narrow the type for mypy.
        return Response(serialize_current_user(cast(User, request.user)))


class TeamViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Team.objects.filter(is_active=True)
    serializer_class = TeamSerializer
    permission_classes = [IsAuthenticated]


class EmployeeViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Employee.objects.filter(is_active=True).select_related("team")
    serializer_class = EmployeeListSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter]
    search_fields = ["full_name", "employee_code"]

    def get_queryset(self) -> QuerySet[Employee]:
        queryset = super().get_queryset()

        role = self.request.query_params.get("role")
        if role:
            queryset = queryset.filter(user__groups__name=role)

        return queryset
