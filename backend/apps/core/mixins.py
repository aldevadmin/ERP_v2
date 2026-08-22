from django.db.models import Model
from django.db.models.deletion import ProtectedError
from rest_framework import serializers


def protected_error_message(exc: ProtectedError) -> str:
    """Turn a Django `ProtectedError` into a message naming what's still
    referencing the record — generic model-name-and-count for most
    relationships, upgraded to naming the actual Product Route(s) by name
    for `ProcessRouteNode`, since "referenced by 2 process route nodes"
    means nothing to a user but "used in Product Route X" does.
    """
    from apps.product_routes.models import ProcessRouteNode

    objects: list[Model] = list(exc.protected_objects)
    route_names = sorted(
        {
            obj.route_version.process_route.name  # type: ignore[attr-defined]
            for obj in objects
            if isinstance(obj, ProcessRouteNode)
        }
    )
    remaining = [obj for obj in objects if not isinstance(obj, ProcessRouteNode)]

    reasons = []
    if route_names:
        names = ", ".join(f'"{name}"' for name in route_names)
        reasons.append(f"used in Product Route {names}")

    counts_by_label: dict[str, int] = {}
    for obj in remaining:
        label = str(obj._meta.verbose_name_plural)
        counts_by_label[label] = counts_by_label.get(label, 0) + 1
    for label, count in counts_by_label.items():
        reasons.append(f"referenced by {count} {label}")

    return "Cannot delete — " + "; also ".join(reasons) + "."


class ProtectedDestroyMixin:
    """Adds friendly-error handling to `DestroyModelMixin.destroy()` —
    catches the `ProtectedError` Django raises when a PROTECT'd foreign key
    still points at this row, and turns it into a 400 with a readable
    `detail` instead of letting a raw 500 through.
    """

    def perform_destroy(self, instance: Model) -> None:
        try:
            instance.delete()
        except ProtectedError as exc:
            raise serializers.ValidationError({"detail": protected_error_message(exc)}) from exc
