from django.contrib import admin

from .models import (
    BoxingRecord,
    PackingAllotment,
    PackingDayClosure,
    PackingLineFlag,
    WorkCentreRecord,
    WorkCentreRouteNodeV1,
    WorkCentreStatus,
)

admin.site.register(PackingLineFlag)
admin.site.register(PackingAllotment)
admin.site.register(WorkCentreRecord)
admin.site.register(BoxingRecord)
admin.site.register(WorkCentreStatus)
admin.site.register(WorkCentreRouteNodeV1)
admin.site.register(PackingDayClosure)
