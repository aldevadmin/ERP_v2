from django.db import connection
from django.db.utils import OperationalError
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView


class HealthCheckView(APIView):
    """Liveness + database connectivity check. No auth required."""

    permission_classes = [AllowAny]

    def get(self, request: Request) -> Response:
        try:
            connection.ensure_connection()
            database_status = "ok"
        except OperationalError:
            database_status = "error"

        return Response(
            {
                "status": "ok" if database_status == "ok" else "error",
                "service": "erp-backend",
                "database": database_status,
            }
        )
