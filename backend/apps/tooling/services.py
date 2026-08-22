from decimal import Decimal

from apps.processes.models import ProcessDefinition

from .models import WorkCentrePosition


def resolve_standard_rate(
    position: WorkCentrePosition, process_definition: ProcessDefinition
) -> Decimal | None:
    """4-tier fallback per spec:
    1. The position's currently active ToolingAssignment.standard_rate_override
    2. That assignment's Tooling.default_standard_rate
    3. WorkCentreProcessCapability.standard_rate for this work centre + process
    4. ProcessDefinitionVersion — no scalar rate field exists there yet
       (only StandardRateConfigLevel, which names WHERE to look rather than
       a number itself), so there is no further fallback in this codebase;
       returns None once tiers 1-3 are exhausted.
    """
    from apps.work_centres.models import WorkCentreProcessCapability

    assignment = (
        position.assignments.filter(effective_to__isnull=True).order_by("-effective_from").first()
    )
    if assignment:
        if assignment.standard_rate_override is not None:
            return assignment.standard_rate_override
        if assignment.tooling.default_standard_rate is not None:
            return assignment.tooling.default_standard_rate

    capability = WorkCentreProcessCapability.objects.filter(
        work_centre=position.work_centre, process_definition=process_definition
    ).first()
    if capability and capability.standard_rate is not None:
        return capability.standard_rate

    return None
