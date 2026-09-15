"""Covers the validation gate wired into `record_work_centre_output`/
`record_boxing_output`: a Work Centre migrated to the generic engine (via
`WorkCentreRouteNodeV1`) must have the Job's real SKU resolvable through
`apps.product_routes_v1.services.resolve_item` before an entry is
accepted — nothing is ever persisted from that resolution, it's purely a
pass/fail gate. A Work Centre with no such link keeps behaving exactly as
before (already covered by `test_boxing.py`).
"""

import pytest
from django.utils import timezone

from apps.customers.models import Customer
from apps.export_orders.models import ExportOrder, ExportOrderLine
from apps.items.models import Item, ItemGroup
from apps.packing_lite.models import PackingAllotment, WorkCentreRouteNodeV1
from apps.packing_lite.services import record_boxing_output, record_work_centre_output
from apps.processes.models import (
    OutputClassification,
    ProcessCategory,
    ProcessDefinition,
    ProcessInputDefinition,
    ProcessOutputDefinition,
)
from apps.processes.models import ProcessDefinitionVersion as OldProcessDefinitionVersion
from apps.processes_v1.models import (
    ProcessDefinitionV1,
    ProcessDefinitionVersionV1,
    ProcessInputDefinitionV1,
    ProcessOutputDefinitionV1,
)
from apps.product_routes_v1.models import (
    ProcessRouteItemMappingV1,
    ProcessRouteNodeV1,
    ProcessRouteV1,
    ProcessRouteVersionV1,
)
from apps.work_centres.models import WorkCentre, WorkCentreProcessCapability, WorkCentreType

pytestmark = pytest.mark.django_db


@pytest.fixture
def customer(organization):
    return Customer.objects.create(code="CUST-GEN", name="Generic Co", organization=organization)


@pytest.fixture
def finished_item(organization) -> Item:
    return Item.objects.create(
        code="FG-GEN", name="Finished Generic Plate", item_class=Item.ItemClass.FINISHED_GOOD,
        organization=organization,
    )


@pytest.fixture
def line(customer, finished_item):
    order = ExportOrder.objects.create(
        order_number="EO-GEN-0001", customer=customer, customer_po_number="PO-GEN",
        customer_po_date="2026-01-01",
    )
    return ExportOrderLine.objects.create(
        export_order=order, line_number=1, customer_sku_code="SKU-GEN",
        original_customer_quantity=1000, original_customer_unit=ExportOrderLine.Unit.PIECE,
        pieces_per_pouch=1, pouches_per_carton=10, item=finished_item,
    )


@pytest.fixture
def line_without_item(customer):
    order = ExportOrder.objects.create(
        order_number="EO-GEN-0002", customer=customer, customer_po_number="PO-GEN2",
        customer_po_date="2026-01-01",
    )
    return ExportOrderLine.objects.create(
        export_order=order, line_number=1, customer_sku_code="SKU-NOITEM",
        original_customer_quantity=1000, original_customer_unit=ExportOrderLine.Unit.PIECE,
        pieces_per_pouch=1, pouches_per_carton=10,
    )


@pytest.fixture
def allotment(line, organization):
    return PackingAllotment.objects.create(
        export_order_line=line, date=timezone.localdate(), allotted_cartons=5,
        status=PackingAllotment.Status.RELEASED, released_at=timezone.now(), organization=organization,
    )


@pytest.fixture
def allotment_without_item(line_without_item, organization):
    return PackingAllotment.objects.create(
        export_order_line=line_without_item, date=timezone.localdate(), allotted_cartons=5,
        status=PackingAllotment.Status.RELEASED, released_at=timezone.now(), organization=organization,
    )


def _old_engine_work_centre(organization, code: str) -> WorkCentre:
    """A Work Centre configured on the old engine — every migrated Work
    Centre keeps this untouched, since it's still what actually backs
    `ProcessExecution` creation.
    """
    wc_type, _ = WorkCentreType.objects.get_or_create(
        name="Station", defaults={"organization": organization}
    )
    work_centre = WorkCentre.objects.create(code=code, name=code, type=wc_type, organization=organization)
    category = ProcessCategory.objects.create(name=f"Cat-{code}", organization=organization)
    definition = ProcessDefinition.objects.create(name=code, code=f"OLD-{code}", organization=organization)
    version = OldProcessDefinitionVersion.objects.create(
        process_definition=definition, version_number=1, category=category, organization=organization
    )
    ProcessInputDefinition.objects.create(
        process_version=version, sequence=1, input_type=ProcessInputDefinition.InputType.WIP,
        uom="PCS", organization=organization,
    )
    for i, name in enumerate(("Good", "Standard", "Scrap"), start=1):
        ProcessOutputDefinition.objects.create(
            process_version=version, sequence=i, item_type=ProcessOutputDefinition.ItemType.PRODUCT,
            uom="PCS", classification=OutputClassification.objects.get(name=name), organization=organization,
        )
    WorkCentreProcessCapability.objects.create(
        work_centre=work_centre, process_definition=definition, organization=organization
    )
    return work_centre


def _v1_route_node(organization, *, with_mapping_for: Item | None) -> ProcessRouteNodeV1:
    """A minimal, real V1 Sorting-style route/node — Good/Standard/Scrap
    outputs, one WIP input — optionally with item mappings configured for
    `with_mapping_for` (all four roles), mirroring the real migration.
    """
    wip_group = ItemGroup.objects.create(name="WIP Group", organization=organization)
    good_group = ItemGroup.objects.create(name="Good Group", organization=organization)
    std_group = ItemGroup.objects.create(name="Standard Group", organization=organization)
    scrap_group = ItemGroup.objects.create(name="Scrap Group", organization=organization)

    category = ProcessCategory.objects.create(name="Sorting Cat", organization=organization)
    definition = ProcessDefinitionV1.objects.create(
        name="Sorting V1", code="SORTING-V1-TEST", organization=organization
    )
    version = ProcessDefinitionVersionV1.objects.create(
        process_definition=definition, version_number=1, category=category, organization=organization
    )
    ProcessInputDefinitionV1.objects.create(
        process_version=version, sequence=1, item_group=wip_group, uom="PC", organization=organization
    )
    ProcessOutputDefinitionV1.objects.create(
        process_version=version, sequence=1, item_group=good_group,
        classification=OutputClassification.objects.get(name="Good"), uom="PC", organization=organization,
    )
    ProcessOutputDefinitionV1.objects.create(
        process_version=version, sequence=2, item_group=std_group,
        classification=OutputClassification.objects.get(name="Standard"), uom="PC", organization=organization,
    )
    ProcessOutputDefinitionV1.objects.create(
        process_version=version, sequence=3, item_group=scrap_group,
        classification=OutputClassification.objects.get(name="Scrap"), uom="PC", organization=organization,
    )

    route = ProcessRouteV1.objects.create(name="Test Route", item_group=good_group, organization=organization)
    route_version = ProcessRouteVersionV1.objects.create(
        process_route=route, version_number=1, organization=organization
    )
    node = ProcessRouteNodeV1.objects.create(
        route_version=route_version, node_key="sorting", process_definition=definition,
        process_definition_version=version, sequence_hint=1, organization=organization,
    )

    if with_mapping_for is not None:
        wip_item = Item.objects.create(
            code=f"WIP-{with_mapping_for.code}", name="WIP", item_class=Item.ItemClass.WIP,
            item_group=wip_group, organization=organization,
        )
        std_item = Item.objects.create(
            code=f"STD-{with_mapping_for.code}", name="Standard", item_class=Item.ItemClass.WIP,
            item_group=std_group, classification=OutputClassification.objects.get(name="Standard"),
            organization=organization,
        )
        scrap_item = Item.objects.create(
            code=f"SCR-{with_mapping_for.code}", name="Scrap", item_class=Item.ItemClass.SCRAP_BY_PRODUCT,
            item_group=scrap_group, classification=OutputClassification.objects.get(name="Scrap"),
            organization=organization,
        )
        with_mapping_for.item_group = good_group
        with_mapping_for.classification = OutputClassification.objects.get(name="Good")
        with_mapping_for.save(update_fields=["item_group", "classification"])

        ProcessRouteItemMappingV1.objects.create(
            route_version=route_version, node=node, input_definition=version.inputs.first(),
            target_item=with_mapping_for, resolved_item=wip_item, organization=organization,
        )
        ProcessRouteItemMappingV1.objects.create(
            route_version=route_version, node=node,
            output_definition=version.outputs.get(classification__name="Good"),
            target_item=with_mapping_for, resolved_item=with_mapping_for, organization=organization,
        )
        ProcessRouteItemMappingV1.objects.create(
            route_version=route_version, node=node,
            output_definition=version.outputs.get(classification__name="Standard"),
            target_item=with_mapping_for, resolved_item=std_item, organization=organization,
        )
        ProcessRouteItemMappingV1.objects.create(
            route_version=route_version, node=node,
            output_definition=version.outputs.get(classification__name="Scrap"),
            target_item=with_mapping_for, resolved_item=scrap_item, organization=organization,
        )

    return node


class TestWorkCentreOutputGenericEngineGate:
    def test_unmigrated_work_centre_is_unaffected(self, organization, allotment):
        work_centre = _old_engine_work_centre(organization, "WC-UNMIGRATED")

        record = record_work_centre_output(
            allotment=allotment, work_centre=work_centre, packed_plates=10, pouches_packed=5,
            downgraded=0, rejected=0, employee_ids=[], user=None,
        )

        assert record is not None

    def test_migrated_work_centre_accepts_a_mapped_sku(self, organization, allotment, finished_item):
        work_centre = _old_engine_work_centre(organization, "WC-MIGRATED-OK")
        node = _v1_route_node(organization, with_mapping_for=finished_item)
        WorkCentreRouteNodeV1.objects.create(
            work_centre=work_centre, route_node=node, organization=organization
        )

        record = record_work_centre_output(
            allotment=allotment, work_centre=work_centre, packed_plates=10, pouches_packed=5,
            downgraded=2, rejected=1, employee_ids=[], user=None,
        )

        assert record is not None

    def test_migrated_work_centre_rejects_an_unmapped_sku(self, organization, allotment, finished_item):
        work_centre = _old_engine_work_centre(organization, "WC-MIGRATED-UNMAPPED")
        node = _v1_route_node(organization, with_mapping_for=None)  # no mappings configured
        WorkCentreRouteNodeV1.objects.create(
            work_centre=work_centre, route_node=node, organization=organization
        )

        with pytest.raises(ValueError, match="isn't mapped"):
            record_work_centre_output(
                allotment=allotment, work_centre=work_centre, packed_plates=10, pouches_packed=5,
                downgraded=0, rejected=0, employee_ids=[], user=None,
            )

    def test_migrated_work_centre_requires_the_line_to_have_an_item(
        self, organization, allotment_without_item, finished_item
    ):
        work_centre = _old_engine_work_centre(organization, "WC-MIGRATED-NOITEM")
        node = _v1_route_node(organization, with_mapping_for=finished_item)
        WorkCentreRouteNodeV1.objects.create(
            work_centre=work_centre, route_node=node, organization=organization
        )

        with pytest.raises(ValueError, match="no item set"):
            record_work_centre_output(
                allotment=allotment_without_item, work_centre=work_centre, packed_plates=10,
                pouches_packed=5, downgraded=0, rejected=0, employee_ids=[], user=None,
            )


class TestBoxingOutputGenericEngineGate:
    def _boxing_work_centre(self, organization, code: str) -> WorkCentre:
        wc_type, _ = WorkCentreType.objects.get_or_create(
            name="Station", defaults={"organization": organization}
        )
        work_centre = WorkCentre.objects.create(code=code, name=code, type=wc_type, organization=organization)
        category = ProcessCategory.objects.create(name=f"BoxCat-{code}", organization=organization)
        definition = ProcessDefinition.objects.create(
            name=f"Boxing-{code}", code=f"BOX-{code}", organization=organization
        )
        version = OldProcessDefinitionVersion.objects.create(
            process_definition=definition, version_number=1, category=category, organization=organization
        )
        ProcessInputDefinition.objects.create(
            process_version=version, sequence=1, input_type=ProcessInputDefinition.InputType.WIP,
            uom="PCS", organization=organization,
        )
        ProcessOutputDefinition.objects.create(
            process_version=version, sequence=1, item_type=ProcessOutputDefinition.ItemType.PRODUCT,
            uom="PCS", classification=OutputClassification.objects.get(name="Good"), organization=organization,
        )
        WorkCentreProcessCapability.objects.create(
            work_centre=work_centre, process_definition=definition, organization=organization
        )
        return work_centre

    def _v1_boxing_node(self, organization, *, with_mapping_for: Item | None) -> ProcessRouteNodeV1:
        pouch_group = ItemGroup.objects.create(name="Pouch Group", organization=organization)
        box_group = ItemGroup.objects.create(name="Box Group", organization=organization)
        category = ProcessCategory.objects.create(name="Boxing Cat V1", organization=organization)
        definition = ProcessDefinitionV1.objects.create(
            name="Boxing V1", code="BOXING-V1-TEST", organization=organization
        )
        version = ProcessDefinitionVersionV1.objects.create(
            process_definition=definition, version_number=1, category=category, organization=organization
        )
        ProcessInputDefinitionV1.objects.create(
            process_version=version, sequence=1, item_group=pouch_group, uom="PC", organization=organization
        )
        ProcessOutputDefinitionV1.objects.create(
            process_version=version, sequence=1, item_group=box_group,
            classification=OutputClassification.objects.get(name="Good"), uom="PC", organization=organization,
        )
        route = ProcessRouteV1.objects.create(name="Boxing Route", item_group=box_group, organization=organization)
        route_version = ProcessRouteVersionV1.objects.create(
            process_route=route, version_number=1, organization=organization
        )
        node = ProcessRouteNodeV1.objects.create(
            route_version=route_version, node_key="boxing", process_definition=definition,
            process_definition_version=version, sequence_hint=1, organization=organization,
        )
        if with_mapping_for is not None:
            pouch_item = Item.objects.create(
                code=f"PCH-{with_mapping_for.code}", name="Pouch", item_class=Item.ItemClass.PACKAGING_MATERIAL,
                item_group=pouch_group, organization=organization,
            )
            ProcessRouteItemMappingV1.objects.create(
                route_version=route_version, node=node, input_definition=version.inputs.first(),
                target_item=with_mapping_for, resolved_item=pouch_item, organization=organization,
            )
            with_mapping_for.item_group = box_group
            with_mapping_for.classification = OutputClassification.objects.get(name="Good")
            with_mapping_for.save(update_fields=["item_group", "classification"])
            ProcessRouteItemMappingV1.objects.create(
                route_version=route_version, node=node, output_definition=version.outputs.first(),
                target_item=with_mapping_for, resolved_item=with_mapping_for, organization=organization,
            )
        return node

    def test_migrated_boxing_work_centre_accepts_a_mapped_sku(self, organization, allotment, finished_item):
        work_centre = self._boxing_work_centre(organization, "WCBOX-OK")
        node = self._v1_boxing_node(organization, with_mapping_for=finished_item)
        WorkCentreRouteNodeV1.objects.create(
            work_centre=work_centre, route_node=node, organization=organization
        )

        record = record_boxing_output(
            allotment=allotment, work_centre=work_centre, boxes_packed=8, employee_ids=[], user=None,
        )

        assert record is not None

    def test_migrated_boxing_work_centre_rejects_an_unmapped_sku(self, organization, allotment, finished_item):
        work_centre = self._boxing_work_centre(organization, "WCBOX-UNMAPPED")
        node = self._v1_boxing_node(organization, with_mapping_for=None)
        WorkCentreRouteNodeV1.objects.create(
            work_centre=work_centre, route_node=node, organization=organization
        )

        with pytest.raises(ValueError, match="isn't mapped"):
            record_boxing_output(
                allotment=allotment, work_centre=work_centre, boxes_packed=8, employee_ids=[], user=None,
            )
