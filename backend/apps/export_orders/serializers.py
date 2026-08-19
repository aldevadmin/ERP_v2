from datetime import date
from typing import Any, cast

from django.db import transaction
from django.db.models import Sum
from rest_framework import serializers

from apps.accounts.models import Employee
from apps.accounts.serializers import EmployeeListSerializer, TeamSerializer
from apps.core.models import Sequence
from apps.customers.serializers import CustomerAddressSerializer
from apps.products.models import CustomerSKUMapping, Product
from apps.vendors.serializers import VendorSerializer

from .models import (
    ExportOrder,
    ExportOrderLine,
    ExportOrderNote,
    ExportOrderPOVersion,
    ExportOrderStageEvent,
    LoadingTransaction,
    PackingMaterialRequirement,
    PackingTransaction,
    ProcurementRequirement,
    ProcurementTransaction,
    ProductionRequirement,
    ProductionTransaction,
    Shipment,
    ShipmentLine,
    SKUSupplyPlan,
)


def _earliest_container_type(export_order: ExportOrder) -> str | None:
    """A quick-glance container size — the earliest Shipment's planned
    type. An order can be split across several Shipments with different
    container types; this is a summary, not an authoritative figure (the
    Shipping tab shows every Shipment). Reads `export_order.shipments.all()`
    so callers that `prefetch_related("shipments")` avoid an N+1 query.
    """
    shipments = list(export_order.shipments.all())
    if not shipments:
        return None
    earliest = min(shipments, key=lambda s: s.id)
    return earliest.planned_container_type or None


class ExportOrderPOVersionSerializer(serializers.ModelSerializer):
    uploaded_by = serializers.CharField(source="created_by.username", read_only=True)

    class Meta:
        model = ExportOrderPOVersion
        fields = [
            "id",
            "version_number",
            "document",
            "remarks",
            "is_current",
            "created_at",
            "uploaded_by",
        ]
        read_only_fields = ["version_number", "is_current"]

    def create(self, validated_data: dict[str, Any]) -> ExportOrderPOVersion:
        export_order: ExportOrder = self.context["export_order"]
        with transaction.atomic():
            # Serialize concurrent revision uploads for the same order.
            ExportOrder.objects.select_for_update().get(pk=export_order.pk)
            next_number = (
                ExportOrderPOVersion.objects.filter(export_order=export_order)
                .order_by("-version_number")
                .values_list("version_number", flat=True)
                .first()
                or 0
            ) + 1
            ExportOrderPOVersion.objects.filter(export_order=export_order, is_current=True).update(
                is_current=False
            )
            return ExportOrderPOVersion.objects.create(
                export_order=export_order,
                version_number=next_number,
                is_current=True,
                **validated_data,
            )


class ExportOrderListSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    export_coordinator_name = serializers.CharField(
        source="export_coordinator.full_name", read_only=True
    )
    container_type = serializers.SerializerMethodField()

    class Meta:
        model = ExportOrder
        fields = [
            "id",
            "order_number",
            "customer",
            "customer_name",
            "customer_po_number",
            "customer_po_date",
            "destination_port",
            "planned_container_ready_date",
            "container_type",
            "status",
            "export_coordinator_name",
        ]

    def get_container_type(self, obj: ExportOrder) -> str | None:
        return _earliest_container_type(obj)


class ExportOrderSerializer(serializers.ModelSerializer):
    """Full shape for create/retrieve/update. A single serializer covers
    both the lightweight 4-field create and every later detail edit — every
    field beyond customer/customer_po_number/customer_po_date is already
    `blank=True` on the model, so DRF infers them as optional on its own.
    """

    customer_name = serializers.CharField(source="customer.name", read_only=True)
    bill_to_detail = CustomerAddressSerializer(source="bill_to", read_only=True)
    ship_to_detail = CustomerAddressSerializer(source="ship_to", read_only=True)
    export_coordinator_detail = EmployeeListSerializer(source="export_coordinator", read_only=True)
    po_versions = ExportOrderPOVersionSerializer(many=True, read_only=True)
    container_type = serializers.SerializerMethodField()
    stage_history = serializers.SerializerMethodField()

    class Meta:
        model = ExportOrder
        fields = [
            "id",
            "order_number",
            "customer",
            "customer_name",
            "customer_po_number",
            "customer_po_date",
            "export_coordinator",
            "export_coordinator_detail",
            "country",
            "destination_port",
            "requested_shipment_date",
            "planned_container_ready_date",
            "container_type",
            "currency",
            "incoterm",
            "payment_terms",
            "bill_to",
            "bill_to_detail",
            "ship_to",
            "ship_to_detail",
            "status",
            "stage_history",
            "internal_remarks",
            "customer_remarks",
            "po_versions",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["status"]  # only changeable via the cancel/advance actions

    def get_container_type(self, obj: ExportOrder) -> str | None:
        return _earliest_container_type(obj)

    def get_stage_history(self, obj: ExportOrder) -> list[dict[str, Any]]:
        """One entry per stage in `ExportOrder.STAGE_SEQUENCE`, each marked
        COMPLETED/IN_PROGRESS/PENDING against the order's current status,
        with real dates where an `ExportOrderStageEvent` exists for it. A
        cancelled order freezes at whatever stage it reached (shown as
        COMPLETED, since nothing is "in progress" anymore).
        """
        sequence = ExportOrder.STAGE_SEQUENCE
        events = list(obj.stage_events.all())
        first_event_by_status: dict[str, ExportOrderStageEvent] = {}
        for event in events:
            first_event_by_status.setdefault(event.status, event)

        if obj.status in sequence:
            effective_status = obj.status
        elif events:
            effective_status = events[-1].status
        else:
            effective_status = ExportOrder.Status.PLANNING
        current_index = (
            sequence.index(cast(ExportOrder.Status, effective_status))
            if effective_status in sequence
            else 0
        )

        history = []
        for index, stage in enumerate(sequence):
            entered_event = first_event_by_status.get(stage)
            next_event = (
                first_event_by_status.get(sequence[index + 1])
                if index + 1 < len(sequence)
                else None
            )
            if index < current_index:
                state = "COMPLETED"
            elif index == current_index:
                state = "COMPLETED" if obj.status == ExportOrder.Status.CANCELLED else "IN_PROGRESS"
            else:
                state = "PENDING"
            history.append(
                {
                    "status": stage,
                    "label": ExportOrder.Status(stage).label,
                    "state": state,
                    "entered_at": entered_event.created_at if entered_event else None,
                    "completed_at": next_event.created_at if next_event else None,
                }
            )
        return history

    def validate_currency(self, value: str) -> str:
        if not value:
            return value
        value = value.upper()
        if len(value) != 3 or not value.isalpha():
            raise serializers.ValidationError("Currency must be a 3-letter code, e.g. USD.")
        return value

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        customer = attrs.get("customer") or getattr(self.instance, "customer", None)
        for field_name in ("bill_to", "ship_to"):
            address = attrs.get(field_name)
            if address is not None and customer is not None and address.customer_id != customer.id:
                raise serializers.ValidationError(
                    {field_name: "This address does not belong to the selected customer."}
                )
        return attrs

    def create(self, validated_data: dict[str, Any]) -> ExportOrder:
        if not validated_data.get("export_coordinator"):
            request = self.context.get("request")
            if request is not None:
                employee = getattr(request.user, "employee", None)
                if employee is not None and request.user.groups.filter(
                    name="Export Coordinator"
                ).exists():
                    validated_data["export_coordinator"] = employee

        order = ExportOrder.objects.create(
            order_number=self._generate_order_number(), **validated_data
        )
        ExportOrderStageEvent.objects.create(
            export_order=order,
            status=ExportOrder.Status.PLANNING,
            created_by=validated_data.get("created_by"),
        )
        return order

    @staticmethod
    def _generate_order_number() -> str:
        year = date.today().year
        seq = Sequence.next_value(f"export_order:{year}")
        return f"EO-{year}-{seq:04d}"


class ExportOrderNoteSerializer(serializers.ModelSerializer):
    author = serializers.CharField(source="created_by.username", read_only=True)

    class Meta:
        model = ExportOrderNote
        fields = ["id", "text", "author", "created_at"]

    def validate_text(self, value: str) -> str:
        if not value.strip():
            raise serializers.ValidationError("Note text can't be empty.")
        return value


class ExportOrderLineSerializer(serializers.ModelSerializer):
    product_sku_code = serializers.SerializerMethodField()
    product_name = serializers.SerializerMethodField()
    pieces_per_carton = serializers.IntegerField(read_only=True)
    required_pieces = serializers.IntegerField(read_only=True)
    required_pouches = serializers.IntegerField(read_only=True, allow_null=True)
    required_cartons = serializers.IntegerField(read_only=True, allow_null=True)
    required_stickers = serializers.IntegerField(read_only=True)

    class Meta:
        model = ExportOrderLine
        fields = [
            "id",
            "line_number",
            "customer_sku_code",
            "customer_description",
            "product",
            "product_sku_code",
            "product_name",
            "original_customer_quantity",
            "original_customer_unit",
            "pieces_per_pouch",
            "pouches_per_carton",
            "pieces_per_carton",
            "has_retail_sticker",
            "required_pieces",
            "required_pouches",
            "required_cartons",
            "required_stickers",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "line_number",
            "pieces_per_pouch",
            "pouches_per_carton",
            "has_retail_sticker",
        ]

    def get_product_sku_code(self, obj: ExportOrderLine) -> str | None:
        return obj.product.sku_code if obj.product else None

    def get_product_name(self, obj: ExportOrderLine) -> str | None:
        return obj.product.name if obj.product else None

    def validate_original_customer_quantity(self, value: int) -> int:
        if value < 1:
            raise serializers.ValidationError("Quantity must be at least 1.")
        return value

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        export_order: ExportOrder = self.context["export_order"]
        unit = attrs.get(
            "original_customer_unit", getattr(self.instance, "original_customer_unit", None)
        )
        product = attrs.get("product", getattr(self.instance, "product", None))

        if unit != ExportOrderLine.Unit.PIECE:
            if product is None:
                raise serializers.ValidationError(
                    {"product": "Internal SKU is required for Pouch/Carton unit lines."}
                )
            mapping = self._resolve_mapping(export_order, product)
            if mapping is None or mapping.pieces_per_pouch is None:
                raise serializers.ValidationError(
                    {
                        "product": (
                            "No packing configuration found for this customer/SKU. "
                            "Set Pieces per Pouch in Customer SKU Mappings first."
                        )
                    }
                )
            if unit == ExportOrderLine.Unit.CARTON and mapping.pouches_per_carton is None:
                raise serializers.ValidationError(
                    {
                        "product": (
                            "Packing configuration is missing Pouches per Carton "
                            "for this customer/SKU."
                        )
                    }
                )
        return attrs

    @staticmethod
    def _resolve_mapping(export_order: ExportOrder, product: Product) -> CustomerSKUMapping | None:
        return (
            CustomerSKUMapping.objects.filter(customer=export_order.customer, product=product)
            .order_by("id")
            .first()
        )

    def _snapshot_for(
        self, export_order: ExportOrder, product: Product | None
    ) -> tuple[int | None, int | None, bool | None]:
        if product is None:
            return None, None, None
        mapping = self._resolve_mapping(export_order, product)
        if mapping is None:
            return None, None, None
        return mapping.pieces_per_pouch, mapping.pouches_per_carton, mapping.has_retail_sticker

    def create(self, validated_data: dict[str, Any]) -> ExportOrderLine:
        export_order: ExportOrder = self.context["export_order"]
        with transaction.atomic():
            # Serialize concurrent line creation for the same order.
            ExportOrder.objects.select_for_update().get(pk=export_order.pk)
            next_number = (
                ExportOrderLine.objects.filter(export_order=export_order)
                .order_by("-line_number")
                .values_list("line_number", flat=True)
                .first()
                or 0
            ) + 1
            pieces_per_pouch, pouches_per_carton, has_retail_sticker = self._snapshot_for(
                export_order, validated_data.get("product")
            )
            return ExportOrderLine.objects.create(
                export_order=export_order,
                line_number=next_number,
                pieces_per_pouch=pieces_per_pouch,
                pouches_per_carton=pouches_per_carton,
                has_retail_sticker=has_retail_sticker,
                **validated_data,
            )

    def update(
        self, instance: ExportOrderLine, validated_data: dict[str, Any]
    ) -> ExportOrderLine:
        if "product" in validated_data and validated_data["product"] != instance.product:
            pieces_per_pouch, pouches_per_carton, has_retail_sticker = self._snapshot_for(
                instance.export_order, validated_data["product"]
            )
            validated_data["pieces_per_pouch"] = pieces_per_pouch
            validated_data["pouches_per_carton"] = pouches_per_carton
            validated_data["has_retail_sticker"] = has_retail_sticker
        return super().update(instance, validated_data)


class SKUSupplyPlanSerializer(serializers.ModelSerializer):
    """Covers both the singleton `.../supply-plan/` endpoint and (via the
    summary subclass below) the per-order summary list. `self.instance` is
    always set — real or an unsaved default — the view never calls this
    without one (see views.py), so `validate()` can read current values
    straight off it instead of needing serializer context.
    """

    required_qty = serializers.IntegerField(read_only=True)
    planning_balance = serializers.IntegerField(read_only=True)
    overall_sku_expected_ready_date = serializers.DateField(read_only=True, allow_null=True)
    responsible_team_detail = TeamSerializer(source="responsible_team", read_only=True)
    responsible_person_detail = EmployeeListSerializer(source="responsible_person", read_only=True)

    class Meta:
        model = SKUSupplyPlan
        fields = [
            "id",
            "required_qty",
            "quantity_from_stock",
            "quantity_to_produce",
            "quantity_to_procure",
            "planning_balance",
            "is_intentionally_underplanned",
            "production_planned_start",
            "production_expected_completion",
            "procurement_planned_order_date",
            "procurement_expected_receipt",
            "overall_sku_expected_ready_date",
            "responsible_team",
            "responsible_team_detail",
            "responsible_person",
            "responsible_person_detail",
            "risk_status",
            "planning_status",
            "remarks",
            "created_at",
            "updated_at",
        ]

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        # Always set — real or an unsaved default — the view never invokes
        # this serializer without one.
        instance = cast(SKUSupplyPlan, self.instance)
        stock = attrs.get("quantity_from_stock", instance.quantity_from_stock)
        produce = attrs.get("quantity_to_produce", instance.quantity_to_produce)
        procure = attrs.get("quantity_to_procure", instance.quantity_to_procure)
        underplanned = attrs.get(
            "is_intentionally_underplanned", instance.is_intentionally_underplanned
        )
        remarks = attrs.get("remarks", instance.remarks)
        balance = instance.required_qty - stock - produce - procure

        if balance > 0:
            if not underplanned:
                raise serializers.ValidationError(
                    {
                        "planning_balance": (
                            "Planned quantity (Stock + Need to Produce + Need to Procure) must "
                            "equal the Required Quantity, or mark this SKU as intentionally short "
                            "and explain why in Remarks."
                        )
                    }
                )
            if not remarks.strip():
                raise serializers.ValidationError(
                    {
                        "remarks": (
                            "Remarks are required when intentionally planning short "
                            "of the requirement."
                        )
                    }
                )
        return attrs


class SKUSupplyPlanSummarySerializer(SKUSupplyPlanSerializer):
    """Row shape for the SKU Planning tab's summary table — adds line
    identity to the same plan fields the singleton endpoint returns.
    """

    export_order_line = serializers.IntegerField(source="export_order_line.id", read_only=True)
    line_number = serializers.IntegerField(source="export_order_line.line_number", read_only=True)
    customer_sku_code = serializers.CharField(
        source="export_order_line.customer_sku_code", read_only=True
    )
    product_sku_code = serializers.SerializerMethodField()
    product_name = serializers.SerializerMethodField()
    accepted_from_production = serializers.SerializerMethodField()
    accepted_from_procurement = serializers.SerializerMethodField()

    class Meta(SKUSupplyPlanSerializer.Meta):
        fields = [
            *SKUSupplyPlanSerializer.Meta.fields,
            "export_order_line",
            "line_number",
            "customer_sku_code",
            "product_sku_code",
            "product_name",
            "accepted_from_production",
            "accepted_from_procurement",
        ]

    def get_product_sku_code(self, obj: SKUSupplyPlan) -> str | None:
        product = obj.export_order_line.product
        return product.sku_code if product else None

    def get_product_name(self, obj: SKUSupplyPlan) -> str | None:
        product = obj.export_order_line.product
        return product.name if product else None

    def get_accepted_from_production(self, obj: SKUSupplyPlan) -> int:
        requirement = getattr(obj.export_order_line, "production_requirement", None)
        return requirement.cumulative_accepted if requirement else 0

    def get_accepted_from_procurement(self, obj: SKUSupplyPlan) -> int:
        requirement = getattr(obj.export_order_line, "procurement_requirement", None)
        return requirement.cumulative_accepted if requirement else 0


class ProductionRequirementSummarySerializer(serializers.Serializer):
    """Row shape for the Production tab's summary table. Not a
    ModelSerializer — every field beyond the id is a computed property
    (see ProductionRequirement's docstring for why), so there's nothing
    for a ModelSerializer's field introspection to buy us here.
    """

    export_order_line = serializers.IntegerField(source="export_order_line.id")
    line_number = serializers.IntegerField(source="export_order_line.line_number")
    customer_sku_code = serializers.CharField(source="export_order_line.customer_sku_code")
    product_sku_code = serializers.SerializerMethodField()
    product_name = serializers.SerializerMethodField()
    planned_qty = serializers.IntegerField()
    cumulative_produced = serializers.IntegerField()
    cumulative_accepted = serializers.IntegerField()
    cumulative_rejected = serializers.IntegerField()
    progress = serializers.FloatField(allow_null=True)
    balance = serializers.IntegerField()
    status = serializers.CharField()
    last_transaction_at = serializers.DateTimeField(allow_null=True)

    def get_product_sku_code(self, obj: ProductionRequirement) -> str | None:
        product = obj.export_order_line.product
        return product.sku_code if product else None

    def get_product_name(self, obj: ProductionRequirement) -> str | None:
        product = obj.export_order_line.product
        return product.name if product else None


class ProductionTransactionSerializer(serializers.ModelSerializer):
    entered_by = serializers.CharField(source="created_by.username", read_only=True)
    party_team = serializers.CharField(required=True, allow_blank=False, max_length=255)

    class Meta:
        model = ProductionTransaction
        fields = [
            "id",
            "date",
            "quantity_produced",
            "quantity_accepted",
            "quantity_rejected",
            "party_team",
            "remarks",
            "source",
            "entered_by",
            "created_at",
        ]

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        instance = cast(ProductionTransaction | None, self.instance)
        produced = attrs.get(
            "quantity_produced", instance.quantity_produced if instance else None
        )
        accepted = attrs.get(
            "quantity_accepted", instance.quantity_accepted if instance else None
        )
        rejected = attrs.get(
            "quantity_rejected", instance.quantity_rejected if instance else None
        )
        if produced is not None and accepted is not None and rejected is not None:
            if accepted + rejected > produced:
                raise serializers.ValidationError(
                    {
                        "quantity_produced": (
                            "Accepted + Rejected cannot exceed Produced Quantity."
                        )
                    }
                )
        return attrs


class ProcurementRequirementSummarySerializer(serializers.Serializer):
    """Row shape for the Procurement tab's summary table. Not a
    ModelSerializer — every field beyond the id is a computed property
    (see ProcurementRequirement's docstring for why).
    """

    export_order_line = serializers.IntegerField(source="export_order_line.id")
    line_number = serializers.IntegerField(source="export_order_line.line_number")
    customer_sku_code = serializers.CharField(source="export_order_line.customer_sku_code")
    product_sku_code = serializers.SerializerMethodField()
    product_name = serializers.SerializerMethodField()
    planned_qty = serializers.IntegerField()
    cumulative_received = serializers.IntegerField()
    cumulative_accepted = serializers.IntegerField()
    cumulative_rejected = serializers.IntegerField()
    progress = serializers.FloatField(allow_null=True)
    balance = serializers.IntegerField()
    status = serializers.CharField()
    last_transaction_at = serializers.DateTimeField(allow_null=True)

    def get_product_sku_code(self, obj: ProcurementRequirement) -> str | None:
        product = obj.export_order_line.product
        return product.sku_code if product else None

    def get_product_name(self, obj: ProcurementRequirement) -> str | None:
        product = obj.export_order_line.product
        return product.name if product else None


class ProcurementTransactionSerializer(serializers.ModelSerializer):
    entered_by = serializers.CharField(source="created_by.username", read_only=True)
    vendor_detail = VendorSerializer(source="vendor", read_only=True)
    party_team = serializers.CharField(required=True, allow_blank=False, max_length=255)

    class Meta:
        model = ProcurementTransaction
        fields = [
            "id",
            "date",
            "quantity_received",
            "quantity_accepted",
            "quantity_rejected",
            "vendor",
            "vendor_detail",
            "party_team",
            "remarks",
            "entered_by",
            "created_at",
        ]
        extra_kwargs = {"vendor": {"required": False, "allow_null": True}}

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        instance = cast(ProcurementTransaction | None, self.instance)
        received = attrs.get(
            "quantity_received", instance.quantity_received if instance else None
        )
        accepted = attrs.get(
            "quantity_accepted", instance.quantity_accepted if instance else None
        )
        rejected = attrs.get(
            "quantity_rejected", instance.quantity_rejected if instance else None
        )
        if received is not None and accepted is not None and rejected is not None:
            if accepted + rejected > received:
                raise serializers.ValidationError(
                    {
                        "quantity_received": (
                            "Accepted + Rejected cannot exceed Received Quantity."
                        )
                    }
                )
        return attrs


class FulfilmentTransactionSerializer(serializers.Serializer):
    """Row shape for the order-wide, paginated Fulfilment transaction log
    (Recent Fulfilment Transactions) — built from plain dicts merging
    `ProductionTransaction` and `ProcurementTransaction` rows (§ views.py),
    not a ModelSerializer, since no single model backs both. `quantity` is
    `quantity_produced` or `quantity_received` depending on `source` — one
    generic field, matching the UI's single "Received or Produced Qty"
    column rather than two source-specific ones.
    """

    id = serializers.CharField()
    date = serializers.DateField()
    # A field literally named `source` collides with `Field.source`'s own
    # type stub (an unrelated DRF internal) — false-positive, not a runtime
    # issue (DRF's metaclass moves declared fields out of the class body).
    source = serializers.ChoiceField(  # type: ignore[assignment]
        choices=["PRODUCTION", "PROCUREMENT"]
    )
    export_order_line = serializers.IntegerField()
    customer_sku_code = serializers.CharField()
    product_name = serializers.CharField(allow_null=True)
    party_team = serializers.CharField()
    quantity = serializers.IntegerField()
    quantity_accepted = serializers.IntegerField()
    quantity_rejected = serializers.IntegerField()
    remarks = serializers.CharField(allow_blank=True)
    entered_by = serializers.CharField(allow_null=True)
    created_at = serializers.DateTimeField()


class PackingMaterialRequirementSerializer(serializers.ModelSerializer):
    """Covers both the singleton `.../packing-material-requirements/{type}/`
    endpoint and (via the summary subclass below) the per-order summary
    list — same split as `SKUSupplyPlanSerializer`/`SKUSupplyPlanSummarySerializer`.
    `self.instance` is always set (real or an unsaved virtual default), so
    `validate()` can read `material_type` straight off it.
    """

    required_qty = serializers.IntegerField(read_only=True)
    shortage = serializers.IntegerField(read_only=True)
    to_procure_qty = serializers.IntegerField(read_only=True)
    responsible_person_detail = EmployeeListSerializer(source="responsible_person", read_only=True)

    class Meta:
        model = PackingMaterialRequirement
        fields = [
            "id",
            "material_type",
            "required_qty",
            "manual_required_qty",
            "available_stock",
            "ordered_qty",
            "shortage",
            "to_procure_qty",
            "manual_to_procure_qty",
            "expected_arrival_date",
            "received_qty",
            "accepted_qty",
            "responsible_person",
            "responsible_person_detail",
            "status",
            "remarks",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["material_type"]

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        instance = cast(PackingMaterialRequirement, self.instance)
        if "manual_required_qty" in attrs and attrs["manual_required_qty"] is not None:
            material_type = attrs.get("material_type", instance.material_type)
            if material_type != PackingMaterialRequirement.MaterialType.BOX_LABEL:
                raise serializers.ValidationError(
                    {
                        "manual_required_qty": (
                            "Required is calculated automatically for this material "
                            "and cannot be entered manually."
                        )
                    }
                )
        return attrs


class PackingMaterialRequirementSummarySerializer(PackingMaterialRequirementSerializer):
    """Row shape for a Packing Materials tab's summary table — adds line
    identity to the same fields the singleton endpoint returns.
    """

    export_order_line = serializers.IntegerField(source="export_order_line.id", read_only=True)
    line_number = serializers.IntegerField(source="export_order_line.line_number", read_only=True)
    customer_sku_code = serializers.CharField(
        source="export_order_line.customer_sku_code", read_only=True
    )
    product_sku_code = serializers.SerializerMethodField()
    product_name = serializers.SerializerMethodField()

    class Meta(PackingMaterialRequirementSerializer.Meta):
        fields = [
            *PackingMaterialRequirementSerializer.Meta.fields,
            "export_order_line",
            "line_number",
            "customer_sku_code",
            "product_sku_code",
            "product_name",
        ]

    def get_product_sku_code(self, obj: PackingMaterialRequirement) -> str | None:
        product = obj.export_order_line.product
        return product.sku_code if product else None

    def get_product_name(self, obj: PackingMaterialRequirement) -> str | None:
        product = obj.export_order_line.product
        return product.name if product else None


class PackingMonitorRowSerializer(serializers.Serializer):
    """Row shape for the Packing Monitor table. Serializes `ExportOrderLine`
    instances directly — not a ModelSerializer, since every field beyond
    identity is a computed property (see `ExportOrderLine.packed_cartons`
    and friends). No wrapper "requirement" object exists to serialize, unlike
    Production/Procurement.
    """

    export_order_line = serializers.IntegerField(source="id")
    line_number = serializers.IntegerField()
    customer_sku_code = serializers.CharField()
    product_sku_code = serializers.SerializerMethodField()
    product_name = serializers.SerializerMethodField()
    required_cartons = serializers.IntegerField()
    packed_cartons = serializers.IntegerField()
    extra_pouches = serializers.IntegerField()
    balance = serializers.IntegerField(source="packing_balance")
    progress = serializers.FloatField(source="packing_progress", allow_null=True)
    # Pieces-denominated equivalents for the Packing tab's readiness table
    # (ui-spec.md §5.6) — `packable_qty` is the order's required piece
    # quantity (business-rules.md §2), *not* bounded by Fulfilment's
    # Accepted Qty; deliberately a separate, unrelated figure from
    # `required_cartons` above, not a conversion of it (avoids compounding
    # `required_cartons`' ceiling-rounding into a second field).
    packable_qty = serializers.IntegerField(source="required_pieces")
    packed_pieces = serializers.IntegerField()
    balance_pieces = serializers.IntegerField(source="packing_balance_pieces")
    progress_pieces = serializers.FloatField(source="packing_progress_pieces", allow_null=True)
    last_transaction_at = serializers.DateTimeField(
        source="last_packing_transaction_at", allow_null=True
    )

    def get_product_sku_code(self, obj: ExportOrderLine) -> str | None:
        return obj.product.sku_code if obj.product else None

    def get_product_name(self, obj: ExportOrderLine) -> str | None:
        return obj.product.name if obj.product else None


class PackingTransactionSerializer(serializers.ModelSerializer):
    entered_by = serializers.CharField(source="created_by.username", read_only=True)
    calculated_pieces = serializers.IntegerField(read_only=True)
    # Nullable at the model level (existing rows), but required for every
    # new write — same nullable-DB/required-API split as
    # ProcurementTransaction.vendor (domain-model.md §3.5).
    packed_by = serializers.PrimaryKeyRelatedField(
        queryset=Employee.objects.filter(is_active=True), required=True
    )
    packed_by_detail = EmployeeListSerializer(source="packed_by", read_only=True)

    class Meta:
        model = PackingTransaction
        fields = [
            "id",
            "date",
            "entry_type",
            "cartons_packed",
            "pouches_packed",
            "calculated_pieces",
            "packed_by",
            "packed_by_detail",
            "shift_team",
            "remarks",
            "entered_by",
            "created_at",
        ]

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        instance = cast(PackingTransaction | None, self.instance)
        entry_type = attrs.get("entry_type", instance.entry_type if instance else None)
        cartons = attrs.get(
            "cartons_packed", instance.cartons_packed if instance else None
        )
        pouches = attrs.get(
            "pouches_packed", instance.pouches_packed if instance else None
        )

        if entry_type == PackingTransaction.EntryType.CARTON_COMPLETED:
            if not cartons or cartons <= 0:
                raise serializers.ValidationError(
                    {"cartons_packed": "Enter how many cartons were completed."}
                )
            if pouches:
                raise serializers.ValidationError(
                    {"pouches_packed": "Cannot be set for a Cartons Completed entry."}
                )
        elif entry_type == PackingTransaction.EntryType.POUCH_PACKED:
            if not pouches or pouches <= 0:
                raise serializers.ValidationError(
                    {"pouches_packed": "Enter how many pouches were packed."}
                )
            if cartons:
                raise serializers.ValidationError(
                    {"cartons_packed": "Cannot be set for a Pouches Packed entry."}
                )
        return attrs


class PackingTransactionLogSerializer(serializers.ModelSerializer):
    """Row shape for the order-wide, paginated Packing transaction log
    (Recent Packing Transactions) — unlike Fulfilment's equivalent
    (`FulfilmentTransactionSerializer`), this is a plain `ModelSerializer`
    directly on `PackingTransaction`: there's only one source model here,
    no Production/Procurement-style merge needed.
    """

    export_order_line = serializers.IntegerField(source="export_order_line_id")
    customer_sku_code = serializers.CharField(source="export_order_line.customer_sku_code")
    product_name = serializers.SerializerMethodField()
    packed_by_detail = EmployeeListSerializer(source="packed_by", read_only=True)
    entered_by = serializers.CharField(source="created_by.username", read_only=True)
    calculated_pieces = serializers.IntegerField(read_only=True)

    class Meta:
        model = PackingTransaction
        fields = [
            "id",
            "date",
            "export_order_line",
            "customer_sku_code",
            "product_name",
            "entry_type",
            "cartons_packed",
            "pouches_packed",
            "calculated_pieces",
            "packed_by_detail",
            "shift_team",
            "remarks",
            "entered_by",
            "created_at",
        ]

    def get_product_name(self, obj: PackingTransaction) -> str | None:
        product = obj.export_order_line.product
        return product.name if product else None


class ShipmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Shipment
        fields = [
            "id",
            "shipment_number",
            "status",
            "planned_container_type",
            "planned_ready_date",
            "planned_stuffing_date",
            "container_number",
            "remarks",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["shipment_number"]

    def create(self, validated_data: dict[str, Any]) -> Shipment:
        export_order: ExportOrder = self.context["export_order"]
        seq = Sequence.next_value(f"shipment:{export_order.order_number}")
        shipment_number = f"{export_order.order_number}-S{seq:02d}"
        return Shipment.objects.create(
            export_order=export_order, shipment_number=shipment_number, **validated_data
        )


class ShipmentLineSerializer(serializers.ModelSerializer):
    """`validate()` enforces business-rules.md §7's planning rules: a line
    can only be attached to a shipment on the *same* export order
    (guarantees "one container = one customer" structurally), and its
    cross-shipment planned total can never exceed what was actually
    ordered for that SKU. Loading itself (`actual_loaded_cartons` and
    friends) is read-only here — it's written via `LoadingTransaction`
    (`LoadingTransactionSerializer`), not this serializer.
    """

    customer_sku_code = serializers.CharField(
        source="export_order_line.customer_sku_code", read_only=True
    )
    product_sku_code = serializers.SerializerMethodField()
    product_name = serializers.SerializerMethodField()
    planned_cartons = serializers.IntegerField(read_only=True)
    required_cartons = serializers.IntegerField(
        source="export_order_line.required_cartons", read_only=True
    )
    packed_cartons = serializers.IntegerField(
        source="export_order_line.packed_cartons", read_only=True
    )
    remaining_balance_cartons = serializers.IntegerField(
        source="export_order_line.remaining_balance_cartons", read_only=True
    )
    actual_loaded_cartons = serializers.IntegerField(read_only=True)
    loaded_pouches = serializers.IntegerField(read_only=True)
    actual_loaded_qty = serializers.IntegerField(read_only=True)
    difference_cartons = serializers.IntegerField(read_only=True)
    loading_status = serializers.CharField(read_only=True)
    last_loading_transaction_at = serializers.DateTimeField(read_only=True, allow_null=True)
    net_weight_kg = serializers.SerializerMethodField()
    gross_weight_kg = serializers.SerializerMethodField()

    class Meta:
        model = ShipmentLine
        fields = [
            "id",
            "export_order_line",
            "customer_sku_code",
            "product_sku_code",
            "product_name",
            "required_cartons",
            "planned_qty",
            "planned_cartons",
            "packed_cartons",
            "actual_loaded_cartons",
            "loaded_pouches",
            "actual_loaded_qty",
            "difference_cartons",
            "loading_status",
            "last_loading_transaction_at",
            "net_weight_kg",
            "gross_weight_kg",
            "remaining_balance_cartons",
            "remarks",
            "created_at",
            "updated_at",
        ]

    def get_product_sku_code(self, obj: ShipmentLine) -> str | None:
        product = obj.export_order_line.product
        return product.sku_code if product else None

    def get_product_name(self, obj: ShipmentLine) -> str | None:
        product = obj.export_order_line.product
        return product.name if product else None

    def get_net_weight_kg(self, obj: ShipmentLine) -> float | None:
        return self._weight(obj, "carton_net_weight_kg")

    def get_gross_weight_kg(self, obj: ShipmentLine) -> float | None:
        return self._weight(obj, "carton_gross_weight_kg")

    @staticmethod
    def _weight(obj: ShipmentLine, field_name: str) -> float | None:
        """Net/gross weight for the cartons actually loaded — read-only,
        computed from `products.CustomerSKUMapping`'s per-carton weight
        (already captured for packing config), not stored anywhere."""
        if not obj.actual_loaded_cartons:
            return None
        product = obj.export_order_line.product
        if product is None:
            return None
        mapping = (
            CustomerSKUMapping.objects.filter(
                customer=obj.export_order_line.export_order.customer, product=product
            )
            .order_by("id")
            .first()
        )
        per_carton = getattr(mapping, field_name, None) if mapping else None
        if per_carton is None:
            return None
        return float(obj.actual_loaded_cartons * per_carton)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        instance = cast(ShipmentLine | None, self.instance)
        shipment: Shipment = self.context["shipment"]
        export_order_line = attrs.get(
            "export_order_line", instance.export_order_line if instance else None
        )
        planned_qty = attrs.get("planned_qty", instance.planned_qty if instance else None)

        if export_order_line is None:
            return attrs

        if export_order_line.export_order_id != shipment.export_order_id:
            raise serializers.ValidationError(
                {
                    "export_order_line": (
                        "This SKU does not belong to the same export order as the shipment."
                    )
                }
            )

        if planned_qty is not None:
            other_lines = ShipmentLine.objects.filter(export_order_line=export_order_line)
            if instance is not None:
                other_lines = other_lines.exclude(pk=instance.pk)
            already_planned = other_lines.aggregate(total=Sum("planned_qty"))["total"] or 0
            required = export_order_line.required_pieces
            if already_planned + planned_qty > required:
                remaining = max(required - already_planned, 0)
                raise serializers.ValidationError(
                    {
                        "planned_qty": (
                            f"Only {remaining} of this SKU is still unallocated across shipments."
                        )
                    }
                )
        return attrs


class LoadingTransactionSerializer(serializers.ModelSerializer):
    """`validate()` enforces the XOR cartons/pouches rule (same shape as
    `PackingTransactionSerializer`). `variance_reason` is present but
    **not required** — the Loading tab rebuild reframed loading as
    frequent real-time partial updates (every 15-30 minutes, eventually
    barcode-scan-driven), not a single end-of-day snapshot, so requiring
    an explanation every time the running total doesn't yet match
    `planned_cartons` would block the normal, expected case. Superseded
    the earlier "required whenever the cumulative total differs from
    planned" rule (business-rules.md §7) — over/under vs. plan stays
    purely informational (readiness table's Balance/Status columns),
    never blocks a save.
    """

    entered_by = serializers.CharField(source="created_by.username", read_only=True)
    calculated_pieces = serializers.IntegerField(read_only=True)

    class Meta:
        model = LoadingTransaction
        fields = [
            "id",
            "date",
            "entry_type",
            "cartons_loaded",
            "pouches_loaded",
            "calculated_pieces",
            "variance_reason",
            "remarks",
            "entered_by",
            "created_at",
        ]

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        instance = cast(LoadingTransaction | None, self.instance)
        entry_type = attrs.get("entry_type", instance.entry_type if instance else None)
        cartons = attrs.get("cartons_loaded", instance.cartons_loaded if instance else None)
        pouches = attrs.get("pouches_loaded", instance.pouches_loaded if instance else None)

        if entry_type == LoadingTransaction.EntryType.CARTON_LOADED:
            if not cartons or cartons <= 0:
                raise serializers.ValidationError(
                    {"cartons_loaded": "Enter how many cartons were loaded."}
                )
            if pouches:
                raise serializers.ValidationError(
                    {"pouches_loaded": "Cannot be set for a Cartons Loaded entry."}
                )
        elif entry_type == LoadingTransaction.EntryType.POUCH_LOADED:
            if not pouches or pouches <= 0:
                raise serializers.ValidationError(
                    {"pouches_loaded": "Enter how many pouches were loaded."}
                )
            if cartons:
                raise serializers.ValidationError(
                    {"cartons_loaded": "Cannot be set for a Pouches Loaded entry."}
                )
        return attrs


class LoadingTransactionLogSerializer(serializers.ModelSerializer):
    """Row shape for the order-wide (per-shipment), paginated Loading
    transaction log (Loading Transactions) — a real `ModelSerializer`
    directly on `LoadingTransaction`, same simpler-than-Fulfilment shape
    as `PackingTransactionLogSerializer` (one source model, no merge).
    """

    export_order_line = serializers.IntegerField(source="shipment_line.export_order_line_id")
    customer_sku_code = serializers.CharField(
        source="shipment_line.export_order_line.customer_sku_code"
    )
    product_name = serializers.SerializerMethodField()
    entered_by = serializers.CharField(source="created_by.username", read_only=True)
    calculated_pieces = serializers.IntegerField(read_only=True)

    class Meta:
        model = LoadingTransaction
        fields = [
            "id",
            "date",
            "export_order_line",
            "customer_sku_code",
            "product_name",
            "entry_type",
            "cartons_loaded",
            "pouches_loaded",
            "calculated_pieces",
            "variance_reason",
            "remarks",
            "entered_by",
            "created_at",
        ]

    def get_product_name(self, obj: LoadingTransaction) -> str | None:
        product = obj.shipment_line.export_order_line.product
        return product.name if product else None
