from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    BoxingRecordListView,
    CloseTodayView,
    DayReconciliationView,
    PackingAllotmentViewSet,
    PackingLineHoldView,
    PackingLineListView,
    PackingLineSelectView,
    ReleaseAllotmentsView,
    WorkCentreListView,
    WorkCentreRecordListView,
    WorkCentreStatusView,
)

router = DefaultRouter()
router.register("packing-allotments", PackingAllotmentViewSet, basename="packing-lite-allotment")

packing_lines = PackingLineListView.as_view()
packing_line_hold = PackingLineHoldView.as_view()
packing_line_select = PackingLineSelectView.as_view()
release_allotments = ReleaseAllotmentsView.as_view()
work_centres = WorkCentreListView.as_view()
work_centre_records = WorkCentreRecordListView.as_view()
work_centre_status = WorkCentreStatusView.as_view()
boxing_records = BoxingRecordListView.as_view()
day_reconciliation = DayReconciliationView.as_view()
close_today_view = CloseTodayView.as_view()

urlpatterns = [
    path("packing-lines/", packing_lines, name="packing-lite-lines"),
    path("packing-lines/<int:line_pk>/hold/", packing_line_hold, name="packing-lite-line-hold"),
    path("packing-lines/<int:line_pk>/select/", packing_line_select, name="packing-lite-line-select"),
    # Must come before the router include below — otherwise the router's
    # own `packing-allotments/<pk>/` pattern would swallow "release" as if
    # it were a pk.
    path("packing-allotments/release/", release_allotments, name="packing-lite-allotments-release"),
    path("", include(router.urls)),
    path("packing-lite-work-centres/", work_centres, name="packing-lite-work-centres"),
    path(
        "packing-lite-work-centres/<int:work_centre_pk>/status/",
        work_centre_status,
        name="packing-lite-work-centre-status",
    ),
    path(
        "packing-lite-work-centre-records/",
        work_centre_records,
        name="packing-lite-work-centre-records",
    ),
    path(
        "packing-lite-boxing-records/",
        boxing_records,
        name="packing-lite-boxing-records",
    ),
    path("packing-lite-day-reconciliation/", day_reconciliation, name="packing-lite-day-reconciliation"),
    path("packing-lite-close-today/", close_today_view, name="packing-lite-close-today"),
]
