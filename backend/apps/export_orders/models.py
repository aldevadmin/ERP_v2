import math
from datetime import date, datetime

from django.db import models
from django.db.models import F, Max, Sum

from apps.core.models import BaseModel
from apps.products.models import Product


class ExportOrder(BaseModel):
    """The header record for a customer export order.

    This is a vertical slice — header + PO revision history only. No lines,
    supply planning, production, procurement, packing, or shipment yet;
    those are future modules that will reference this record, not fields
    on it (per docs/modules/export-orders/domain-model.md).
    """

    class Status(models.TextChoices):
        PLANNING = "PLANNING", "Planning"
        FULFILMENT = "FULFILMENT", "Fulfilment"
        PACKING = "PACKING", "Packing"
        LOADING = "LOADING", "Loading"
        SHIPPED = "SHIPPED", "Shipped"
        COMPLETE = "COMPLETE", "Complete"
        CANCELLED = "CANCELLED", "Cancelled"

    #: The order stage advances through these, in sequence, via the
    #: `advance` action — never skips, never goes backward (Cancelled is a
    #: separate terminal branch, reachable from any of these via `cancel`).
    STAGE_SEQUENCE = [
        Status.PLANNING,
        Status.FULFILMENT,
        Status.PACKING,
        Status.LOADING,
        Status.SHIPPED,
        Status.COMPLETE,
    ]

    class Incoterm(models.TextChoices):
        EXW = "EXW", "EXW — Ex Works"
        FCA = "FCA", "FCA — Free Carrier"
        CPT = "CPT", "CPT — Carriage Paid To"
        CIP = "CIP", "CIP — Carriage and Insurance Paid To"
        DAP = "DAP", "DAP — Delivered At Place"
        DPU = "DPU", "DPU — Delivered At Place Unloaded"
        DDP = "DDP", "DDP — Delivered Duty Paid"
        FAS = "FAS", "FAS — Free Alongside Ship"
        FOB = "FOB", "FOB — Free On Board"
        CFR = "CFR", "CFR — Cost and Freight"
        CIF = "CIF", "CIF — Cost, Insurance and Freight"

    # Identity — generated, never entered (see serializers.create).
    order_number = models.CharField(max_length=32, unique=True, editable=False)
    customer = models.ForeignKey(
        "customers.Customer", on_delete=models.PROTECT, related_name="export_orders"
    )

    # Order info
    customer_po_number = models.CharField(max_length=64)
    customer_po_date = models.DateField()
    export_coordinator = models.ForeignKey(
        "accounts.Employee",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )

    # Shipping
    country = models.CharField(max_length=100, blank=True)
    destination_port = models.CharField(max_length=100, blank=True)
    requested_shipment_date = models.DateField(null=True, blank=True)
    planned_container_ready_date = models.DateField(null=True, blank=True)

    # Commercial terms
    currency = models.CharField(max_length=3, blank=True)
    incoterm = models.CharField(max_length=3, choices=Incoterm.choices, blank=True)
    payment_terms = models.CharField(max_length=255, blank=True)
    bill_to = models.ForeignKey(
        "customers.CustomerAddress",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="+",
    )
    ship_to = models.ForeignKey(
        "customers.CustomerAddress",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="+",
    )

    # Status & remarks
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PLANNING)
    internal_remarks = models.TextField(blank=True)
    customer_remarks = models.TextField(blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.order_number


class ExportOrderStageEvent(BaseModel):
    """One row per stage the order has entered, in order — a timestamped
    log of `ExportOrder.status` transitions, not a mirror of the current
    value. The first row (`PLANNING`) is seeded when the order is created;
    every later row is added by the `advance` action, never edited or
    deleted (`created_at`/`created_by` from `BaseModel` are the record of
    who advanced it and when). "Completed" for a given stage, shown on the
    Overview tab's Order Progress, is simply the next row's `created_at` —
    computed in the serializer, not stored here.
    """

    export_order = models.ForeignKey(
        ExportOrder, on_delete=models.CASCADE, related_name="stage_events"
    )
    status = models.CharField(max_length=10, choices=ExportOrder.Status.choices)

    class Meta:
        ordering = ["created_at"]

    def __str__(self) -> str:
        return f"{self.export_order.order_number} — {self.status}"


class ExportOrderNote(BaseModel):
    """A free-text, timestamped note against an order — collaborative
    context ("Packing in progress, expect completion by...") rather than
    a formal field. Append-only: no edit/delete route, same precedent as
    `ProductionTransaction`'s correction-by-PATCH-only pattern doesn't
    apply here since there's nothing to correct — a wrong note is just
    superseded by a newer one, not rewritten.
    """

    export_order = models.ForeignKey(ExportOrder, on_delete=models.CASCADE, related_name="notes")
    text = models.TextField()

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.export_order.order_number} note ({self.created_at:%Y-%m-%d})"


class ExportOrderPOVersion(BaseModel):
    """One uploaded revision of the customer's PO document.

    The original PO is never overwritten — each revision is its own row;
    `is_current` marks the latest. History stays queryable indefinitely.
    """

    export_order = models.ForeignKey(
        ExportOrder, on_delete=models.CASCADE, related_name="po_versions"
    )
    version_number = models.PositiveIntegerField(editable=False)
    document = models.FileField(upload_to="export_order_po_versions/")
    remarks = models.CharField(max_length=255, blank=True)
    is_current = models.BooleanField(default=True)

    class Meta:
        ordering = ["-version_number"]
        constraints = [
            models.UniqueConstraint(
                fields=["export_order", "version_number"], name="unique_po_version_number"
            )
        ]

    def __str__(self) -> str:
        return f"{self.export_order.order_number} — PO v{self.version_number}"


class ExportOrderLine(BaseModel):
    """One SKU line of a customer's PO, as captured against an ExportOrder.

    `pieces_per_pouch`/`pouches_per_carton`/`has_retail_sticker` are a
    snapshot copied from `products.CustomerSKUMapping` at the moment
    `product` is (re-)set — a live FK would let a later master-data edit
    silently rewrite an already-captured line (see CustomerSKUMapping's own
    docstring and docs/modules/export-orders/business-rules.md §2).
    Everything derived from these values (pieces per carton, required
    pieces/pouches/cartons/stickers) is a plain Python property, never
    stored, so it can't drift out of sync with its inputs — same pattern as
    `products.CustomerSKUMapping.pieces_per_carton`.
    """

    class Unit(models.TextChoices):
        PIECE = "PIECE", "Pieces"
        POUCH = "POUCH", "Pouches"
        CARTON = "CARTON", "Cartons"

    export_order = models.ForeignKey(ExportOrder, on_delete=models.CASCADE, related_name="lines")
    line_number = models.PositiveIntegerField(editable=False)

    customer_sku_code = models.CharField(max_length=64)
    customer_description = models.CharField(max_length=255, blank=True)
    product = models.ForeignKey(
        "products.Product",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="export_order_lines",
    )

    original_customer_quantity = models.PositiveIntegerField()
    original_customer_unit = models.CharField(max_length=10, choices=Unit.choices)

    # Packing configuration snapshot — see class docstring.
    pieces_per_pouch = models.PositiveIntegerField(null=True, blank=True, editable=False)
    pouches_per_carton = models.PositiveIntegerField(null=True, blank=True, editable=False)
    has_retail_sticker = models.BooleanField(null=True, blank=True, editable=False)

    # Internal bookkeeping for the Loading workflow's stock-return
    # reconciliation only — never exposed via the API. See
    # `sync_stock_return()` below for what it's for.
    stock_returned_cartons = models.PositiveIntegerField(default=0, editable=False)

    class Meta:
        ordering = ["line_number"]
        constraints = [
            models.UniqueConstraint(
                fields=["export_order", "line_number"], name="unique_export_order_line_number"
            )
        ]

    def __str__(self) -> str:
        return f"{self.export_order.order_number} — line {self.line_number}"

    @property
    def pieces_per_carton(self) -> int | None:
        if self.pieces_per_pouch is None or self.pouches_per_carton is None:
            return None
        return self.pieces_per_pouch * self.pouches_per_carton

    @property
    def required_pieces(self) -> int:
        """See business-rules.md §2. Assumes packing config is present
        whenever the unit needs it — enforced at save time by
        ExportOrderLineSerializer.validate(), not re-checked here.
        """
        if self.original_customer_unit == self.Unit.PIECE:
            return self.original_customer_quantity
        pieces_per_pouch = self.pieces_per_pouch or 0
        if self.original_customer_unit == self.Unit.POUCH:
            return self.original_customer_quantity * pieces_per_pouch
        return self.original_customer_quantity * pieces_per_pouch * (self.pouches_per_carton or 0)

    @property
    def required_pouches(self) -> int | None:
        if not self.pieces_per_pouch:
            return None
        return math.ceil(self.required_pieces / self.pieces_per_pouch)

    @property
    def required_cartons(self) -> int | None:
        required_pouches = self.required_pouches
        if not self.pouches_per_carton or required_pouches is None:
            return None
        return math.ceil(required_pouches / self.pouches_per_carton)

    @property
    def required_stickers(self) -> int:
        """1 sticker per required pouch, per business-rules.md §6 — only
        when the snapshotted `has_retail_sticker` flag is true. `0`, not
        `None`: "no stickers needed" is a meaningful answer here, not
        missing data.
        """
        if not self.has_retail_sticker:
            return 0
        return self.required_pouches or 0

    def _packing_cumulative(self, entry_type: str, field: str) -> int:
        return (
            self.packing_transactions.filter(entry_type=entry_type).aggregate(total=Sum(field))[
                "total"
            ]
            or 0
        )

    @property
    def packed_cartons(self) -> int:
        return self._packing_cumulative(
            PackingTransaction.EntryType.CARTON_COMPLETED, "cartons_packed"
        )

    @property
    def extra_pouches(self) -> int:
        return self._packing_cumulative(PackingTransaction.EntryType.POUCH_PACKED, "pouches_packed")

    @property
    def packing_balance(self) -> int | None:
        required = self.required_cartons
        return None if required is None else required - self.packed_cartons

    @property
    def packing_progress(self) -> float | None:
        required = self.required_cartons
        if not required:
            return None
        return self.packed_cartons / required

    @property
    def packed_pieces(self) -> int:
        """Pieces actually packed, both entry types combined — unlike
        `packed_cartons`/`extra_pouches` above, which stay carton/pouch-only
        and never sum against each other. Reuses those two existing
        DB-aggregated cumulatives rather than re-querying transactions.
        """
        pieces_per_carton = self.pieces_per_carton or 0
        pieces_per_pouch = self.pieces_per_pouch or 0
        return self.packed_cartons * pieces_per_carton + self.extra_pouches * pieces_per_pouch

    @property
    def packing_balance_pieces(self) -> int:
        return self.required_pieces - self.packed_pieces

    @property
    def packing_progress_pieces(self) -> float | None:
        required = self.required_pieces
        if not required:
            return None
        return self.packed_pieces / required

    @property
    def last_packing_transaction_at(self) -> datetime | None:
        if self.pk is None:
            return None
        return self.packing_transactions.aggregate(latest=Max("created_at"))["latest"]

    @property
    def total_actual_loaded_cartons(self) -> int:
        return (
            LoadingTransaction.objects.filter(
                shipment_line__export_order_line=self,
                entry_type=LoadingTransaction.EntryType.CARTON_LOADED,
            ).aggregate(total=Sum("cartons_loaded"))["total"]
            or 0
        )

    @property
    def remaining_balance_cartons(self) -> int | None:
        """How much of this SKU's *total order* (across every Shipment it's
        been split onto) is still not loaded onto any shipment yet —
        distinct from a single Shipment's own planned/loaded figures.
        """
        required = self.required_cartons
        if required is None:
            return None
        return max(required - self.total_actual_loaded_cartons, 0)

    def sync_stock_return(self) -> None:
        """Packed-but-not-loaded cartons return to `Product.available_qty`
        (business-rules.md §7). Applied as a delta against
        `stock_returned_cartons` (this line's own prior contribution), not
        a wholesale re-add, so it stays correct no matter how many times a
        loading entry is corrected or how many Shipments this line is
        split across — each recomputation only ever nudges `available_qty`
        by what actually changed.
        """
        if self.product_id is None:
            return
        new_surplus = max(self.packed_cartons - self.total_actual_loaded_cartons, 0)
        delta = new_surplus - self.stock_returned_cartons
        if delta != 0:
            Product.objects.filter(pk=self.product_id).update(
                available_qty=F("available_qty") + delta
            )
        self.stock_returned_cartons = new_surplus
        self.save(update_fields=["stock_returned_cartons"])


class SKUSupplyPlan(BaseModel):
    """One per ExportOrderLine — how its required quantity will be sourced:
    some from existing stock, some to be produced, some to be procured, all
    three usable simultaneously.

    `required_qty`/`planning_balance`/`overall_sku_expected_ready_date` are
    all properties, never stored — same "derived, not stored or edited
    independently" rule ExportOrderLine's own computed fields already
    follow. No row is auto-created when its ExportOrderLine is created;
    the API layer synthesizes an unsaved default instance for GET until
    the first PATCH persists one (see views.py).

    `quantity_from_stock` is a manually-entered planning figure, not
    checked against a real inventory balance — no Inventory module exists
    yet (see docs/modules/export-orders/domain-model.md §6 open question
    #5). `planning_status`/`risk_status` are likewise manually set: the
    "Ready" auto-derivation described in business-rules.md §3 needs
    cumulative Accepted Production/Procurement, which don't exist yet
    either (Production/Procurement modules are still design-only).
    """

    class RiskStatus(models.TextChoices):
        ON_TRACK = "ON_TRACK", "On Track"
        AT_RISK = "AT_RISK", "At Risk"
        DELAYED = "DELAYED", "Delayed"

    class PlanningStatus(models.TextChoices):
        NOT_STARTED = "NOT_STARTED", "Not Started"
        IN_PROGRESS = "IN_PROGRESS", "In Progress"
        READY = "READY", "Ready"
        DELAYED = "DELAYED", "Delayed"

    export_order_line = models.OneToOneField(
        ExportOrderLine, on_delete=models.CASCADE, related_name="supply_plan"
    )

    quantity_from_stock = models.PositiveIntegerField(default=0)
    quantity_to_produce = models.PositiveIntegerField(default=0)
    quantity_to_procure = models.PositiveIntegerField(default=0)
    is_intentionally_underplanned = models.BooleanField(default=False)

    production_planned_start = models.DateField(null=True, blank=True)
    production_expected_completion = models.DateField(null=True, blank=True)
    procurement_planned_order_date = models.DateField(null=True, blank=True)
    procurement_expected_receipt = models.DateField(null=True, blank=True)

    responsible_team = models.ForeignKey(
        "accounts.Team", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    responsible_person = models.ForeignKey(
        "accounts.Employee", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    risk_status = models.CharField(
        max_length=10, choices=RiskStatus.choices, default=RiskStatus.ON_TRACK
    )
    planning_status = models.CharField(
        max_length=15, choices=PlanningStatus.choices, default=PlanningStatus.NOT_STARTED
    )
    remarks = models.TextField(blank=True)

    def __str__(self) -> str:
        return f"{self.export_order_line} — supply plan"

    @property
    def required_qty(self) -> int:
        return self.export_order_line.required_pieces

    @property
    def planning_balance(self) -> int:
        """See business-rules.md §3. Positive = under-planned (needs
        `is_intentionally_underplanned` + remarks to save). Negative =
        over-planned, always allowed."""
        return (
            self.required_qty
            - self.quantity_from_stock
            - self.quantity_to_produce
            - self.quantity_to_procure
        )

    @property
    def overall_sku_expected_ready_date(self) -> date | None:
        """Max of whichever of production/procurement are actually "in
        play" (their planned quantity > 0). If an in-play source has no
        expected date yet, the whole result is null — we can't claim a
        ready date while a used supply source is still undated. Fully
        stock-sourced (produce = procure = 0) also returns null; no date
        is faked to mean "available now"."""
        dates_in_play = []
        if self.quantity_to_produce > 0:
            if self.production_expected_completion is None:
                return None
            dates_in_play.append(self.production_expected_completion)
        if self.quantity_to_procure > 0:
            if self.procurement_expected_receipt is None:
                return None
            dates_in_play.append(self.procurement_expected_receipt)
        return max(dates_in_play) if dates_in_play else None


class ProductionRequirement(BaseModel):
    """One per ExportOrderLine — the anchor `ProductionTransaction` rows
    attach to, and the object Accepted/Progress/Balance/Status are computed
    against.

    Deliberately thin: it stores nothing but the link to the line. Planned
    quantity, dates, and responsible person/team all live on `SKUSupplyPlan`
    already (`quantity_to_produce`, `production_planned_start`,
    `production_expected_completion`, `responsible_team`/`responsible_person`)
    — duplicating them here would let the two drift apart. No row is
    auto-created when a line's supply plan first gets a
    `quantity_to_produce` > 0; the API synthesizes a virtual unsaved
    instance for GET, same pattern as SKUSupplyPlan itself, and the first
    POST of a transaction against the line creates the real row (see
    views.py).

    CRITICAL BUSINESS RULE (CLAUDE.md, business-rules.md §4): Export Order
    availability from Production is `SUM(quantity_accepted)` only.
    `quantity_produced` is real, informational data — it is stored on each
    transaction — but no property here ever reads it for
    progress/balance/status. Only `cumulative_accepted` feeds those.
    """

    export_order_line = models.OneToOneField(
        ExportOrderLine, on_delete=models.CASCADE, related_name="production_requirement"
    )

    def __str__(self) -> str:
        return f"{self.export_order_line} — production requirement"

    @property
    def planned_qty(self) -> int:
        plan = getattr(self.export_order_line, "supply_plan", None)
        return plan.quantity_to_produce if plan else 0

    def _cumulative(self, field: str) -> int:
        if self.pk is None:
            return 0
        return self.transactions.aggregate(total=Sum(field))["total"] or 0

    @property
    def cumulative_produced(self) -> int:
        return self._cumulative("quantity_produced")

    @property
    def cumulative_accepted(self) -> int:
        return self._cumulative("quantity_accepted")

    @property
    def cumulative_rejected(self) -> int:
        return self._cumulative("quantity_rejected")

    @property
    def progress(self) -> float | None:
        planned = self.planned_qty
        if planned <= 0:
            return None
        return self.cumulative_accepted / planned

    @property
    def balance(self) -> int:
        return self.planned_qty - self.cumulative_accepted

    @property
    def status(self) -> str:
        plan = getattr(self.export_order_line, "supply_plan", None)
        if self.planned_qty > 0 and self.cumulative_accepted >= self.planned_qty:
            return SKUSupplyPlan.PlanningStatus.READY
        if self.pk is None or not self.transactions.exists():
            return SKUSupplyPlan.PlanningStatus.NOT_STARTED
        expected_completion = plan.production_expected_completion if plan else None
        if expected_completion is not None and expected_completion < date.today():
            return SKUSupplyPlan.PlanningStatus.DELAYED
        return SKUSupplyPlan.PlanningStatus.IN_PROGRESS

    @property
    def last_transaction_at(self) -> datetime | None:
        if self.pk is None:
            return None
        return self.transactions.aggregate(latest=Max("created_at"))["latest"]


class ProductionTransaction(BaseModel):
    """One daily production update against a ProductionRequirement.

    `quantity_produced` is real/informational only — see
    ProductionRequirement's docstring for why it never feeds
    availability/progress. `entered_by` is not a separate field; it's the
    inherited `created_by`, exposed read-only, same pattern as
    `ExportOrderPOVersionSerializer.uploaded_by`.
    """

    class Source(models.TextChoices):
        MANUAL = "MANUAL", "Manual"
        PRODUCTION_MODULE = "PRODUCTION_MODULE", "Production Module"

    production_requirement = models.ForeignKey(
        ProductionRequirement, on_delete=models.CASCADE, related_name="transactions"
    )
    date = models.DateField()
    quantity_produced = models.PositiveIntegerField()
    quantity_accepted = models.PositiveIntegerField()
    quantity_rejected = models.PositiveIntegerField()
    # Free text, not a Team FK — "who produced this" is recorded as
    # entered, not looked up against a fixed roster (unlike Procurement's
    # `vendor`, which stays a real FK for the master-data case).
    party_team = models.CharField(max_length=255, blank=True)
    remarks = models.TextField(blank=True)
    source = models.CharField(max_length=20, choices=Source.choices, default=Source.MANUAL)

    class Meta:
        ordering = ["-date", "-created_at"]

    def __str__(self) -> str:
        return f"{self.production_requirement.export_order_line} — {self.date}"


class ProcurementRequirement(BaseModel):
    """One per ExportOrderLine — same "thin anchor" pattern as
    `ProductionRequirement` (see its docstring). Planned quantity is read
    live from `export_order_line.supply_plan.quantity_to_procure`, never
    duplicated here.

    Unlike Production, vendor identity lives on each `ProcurementTransaction`,
    not here — receipts can arrive in multiple lots, realistically from
    different vendors for the same SKU (split sourcing), so pinning one
    vendor per requirement would be both inaccurate and would need a
    separate "assign vendor" step before any receipt exists.

    CRITICAL BUSINESS RULE (CLAUDE.md, business-rules.md §5): Export Order
    availability from Procurement is `SUM(quantity_accepted)` only.
    `quantity_received` is real, informational data — never read by
    progress/balance/status.
    """

    export_order_line = models.OneToOneField(
        ExportOrderLine, on_delete=models.CASCADE, related_name="procurement_requirement"
    )

    def __str__(self) -> str:
        return f"{self.export_order_line} — procurement requirement"

    @property
    def planned_qty(self) -> int:
        plan = getattr(self.export_order_line, "supply_plan", None)
        return plan.quantity_to_procure if plan else 0

    def _cumulative(self, field: str) -> int:
        if self.pk is None:
            return 0
        return self.transactions.aggregate(total=Sum(field))["total"] or 0

    @property
    def cumulative_received(self) -> int:
        return self._cumulative("quantity_received")

    @property
    def cumulative_accepted(self) -> int:
        return self._cumulative("quantity_accepted")

    @property
    def cumulative_rejected(self) -> int:
        return self._cumulative("quantity_rejected")

    @property
    def progress(self) -> float | None:
        planned = self.planned_qty
        if planned <= 0:
            return None
        return self.cumulative_accepted / planned

    @property
    def balance(self) -> int:
        return self.planned_qty - self.cumulative_accepted

    @property
    def status(self) -> str:
        plan = getattr(self.export_order_line, "supply_plan", None)
        if self.planned_qty > 0 and self.cumulative_accepted >= self.planned_qty:
            return SKUSupplyPlan.PlanningStatus.READY
        if self.pk is None or not self.transactions.exists():
            return SKUSupplyPlan.PlanningStatus.NOT_STARTED
        expected_receipt = plan.procurement_expected_receipt if plan else None
        if expected_receipt is not None and expected_receipt < date.today():
            return SKUSupplyPlan.PlanningStatus.DELAYED
        return SKUSupplyPlan.PlanningStatus.IN_PROGRESS

    @property
    def last_transaction_at(self) -> datetime | None:
        if self.pk is None:
            return None
        return self.transactions.aggregate(latest=Max("created_at"))["latest"]


class ProcurementTransaction(BaseModel):
    """One receipt lot against a ProcurementRequirement. `quantity_received`
    is real/informational only — see ProcurementRequirement's docstring for
    why it never feeds availability/progress. `entered_by` is `created_by`,
    same pattern as ProductionTransaction.

    `vendor` (FK) is kept for existing rows and reporting, but is no longer
    required — the Fulfilment UI now captures `party_team` (free text,
    autocomplete-suggested from the Vendor list, not enforced against it)
    for both Production and Procurement, so a receipt can be logged without
    first creating a Vendor master record.
    """

    procurement_requirement = models.ForeignKey(
        ProcurementRequirement, on_delete=models.CASCADE, related_name="transactions"
    )
    vendor = models.ForeignKey(
        "vendors.Vendor", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    date = models.DateField()
    quantity_received = models.PositiveIntegerField()
    quantity_accepted = models.PositiveIntegerField()
    quantity_rejected = models.PositiveIntegerField()
    party_team = models.CharField(max_length=255, blank=True)
    remarks = models.TextField(blank=True)

    class Meta:
        ordering = ["-date", "-created_at"]

    def __str__(self) -> str:
        return f"{self.procurement_requirement.export_order_line} — {self.date}"


class PackingMaterialRequirement(BaseModel):
    """One per (ExportOrderLine, material type) — NOT a full Procurement
    module: a single manually-updated row, not a Requirement+Transaction
    ledger like Production/Procurement. Matches `SKUSupplyPlan`'s pattern
    instead — `available_stock`/`ordered_qty`/`expected_arrival_date`/
    `received_qty`/`accepted_qty`/`responsible_person`/`status` are all
    plain manually-entered fields, no Inventory or Procurement system
    behind any of them (same reasoning as `SKUSupplyPlan.quantity_from_stock`).

    `required_qty` is a computed property for every material type except
    `BOX_LABEL`, which has no formula anywhere in `products.CustomerSKUMapping`
    — that's the one deliberate exception to "derived, not stored," backed
    by `manual_required_qty`.
    """

    class MaterialType(models.TextChoices):
        CARTON = "CARTON", "Cartons"
        POUCH = "POUCH", "Pouches"
        RETAIL_STICKER = "RETAIL_STICKER", "Retail Stickers"
        BOX_LABEL = "BOX_LABEL", "Box Labels"

    export_order_line = models.ForeignKey(
        ExportOrderLine, on_delete=models.CASCADE, related_name="packing_material_requirements"
    )
    material_type = models.CharField(max_length=20, choices=MaterialType.choices)

    # Only ever set for BOX_LABEL — see class docstring / required_qty below.
    manual_required_qty = models.PositiveIntegerField(null=True, blank=True)

    # Overrides `shortage` when set — e.g. procuring extra to cover
    # expected packing damage. Unlike `manual_required_qty`, this applies
    # to every material type, not just BOX_LABEL, and isn't floored at
    # `shortage`: a coordinator's judgment call, not a derived figure.
    manual_to_procure_qty = models.PositiveIntegerField(null=True, blank=True)

    available_stock = models.PositiveIntegerField(default=0)
    ordered_qty = models.PositiveIntegerField(default=0)
    expected_arrival_date = models.DateField(null=True, blank=True)
    received_qty = models.PositiveIntegerField(null=True, blank=True)
    accepted_qty = models.PositiveIntegerField(null=True, blank=True)
    responsible_person = models.ForeignKey(
        "accounts.Employee", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    status = models.CharField(
        max_length=15,
        choices=SKUSupplyPlan.PlanningStatus.choices,
        default=SKUSupplyPlan.PlanningStatus.NOT_STARTED,
    )
    remarks = models.TextField(blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["export_order_line", "material_type"],
                name="unique_packing_material_per_line",
            )
        ]

    def __str__(self) -> str:
        return f"{self.export_order_line} — {self.get_material_type_display()}"

    @property
    def required_qty(self) -> int:
        line = self.export_order_line
        if self.material_type == self.MaterialType.CARTON:
            return line.required_cartons or 0
        if self.material_type == self.MaterialType.POUCH:
            return line.required_pouches or 0
        if self.material_type == self.MaterialType.RETAIL_STICKER:
            return line.required_stickers
        return self.manual_required_qty or 0  # BOX_LABEL

    @property
    def shortage(self) -> int:
        return max(self.required_qty - self.available_stock, 0)

    @property
    def to_procure_qty(self) -> int:
        """What's actually going to be ordered — `shortage` by default,
        overridable via `manual_to_procure_qty` (e.g. a damage buffer).
        Not clamped to `shortage`: the override is a judgment call, not a
        correction, so a lower value is accepted same as a higher one.
        """
        if self.manual_to_procure_qty is not None:
            return self.manual_to_procure_qty
        return self.shortage


class PackingTransaction(BaseModel):
    """One daily packing update against an ExportOrderLine.

    No separate "PackingRequirement" anchor — unlike Production/Procurement,
    "Required Cartons" is already a live property on `ExportOrderLine`
    (`required_cartons`), not a separately-planned quantity, so there's
    nothing to anchor a plan to. This FKs straight to `ExportOrderLine`.

    Two independent, monotonically-increasing sums (business-rules.md §6):
    `CARTON_COMPLETED` entries feed `ExportOrderLine.packed_cartons`,
    `POUCH_PACKED` entries feed `ExportOrderLine.extra_pouches`. Logging
    pouches never increments packed cartons, and logging a carton never
    decrements extra pouches — pouches packed without a completed carton
    must never count as a fully packed carton.
    """

    class EntryType(models.TextChoices):
        CARTON_COMPLETED = "CARTON_COMPLETED", "Cartons Completed"
        POUCH_PACKED = "POUCH_PACKED", "Pouches Packed"

    export_order_line = models.ForeignKey(
        ExportOrderLine, on_delete=models.CASCADE, related_name="packing_transactions"
    )
    date = models.DateField()
    entry_type = models.CharField(max_length=20, choices=EntryType.choices)
    cartons_packed = models.PositiveIntegerField(null=True, blank=True)
    pouches_packed = models.PositiveIntegerField(null=True, blank=True)
    # Nullable so existing rows don't need a backfill — required by the
    # serializer for new writes (same nullable-DB/required-API split as
    # ProcurementTransaction.vendor). Distinct from `created_by` (inherited
    # audit trail of who submitted the entry): a coordinator can log a
    # transaction on behalf of a floor worker who has no ERP login.
    packed_by = models.ForeignKey(
        "accounts.Employee", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    # Free text, not a fixed Shift enum — suggested from accounts.Team names
    # but not validated against them, same pattern as the Fulfilment tab's
    # `party_team`. Optional (unlike party_team): the mockup doesn't mark it
    # required.
    shift_team = models.CharField(max_length=255, blank=True)
    remarks = models.TextField(blank=True)

    class Meta:
        ordering = ["-date", "-created_at"]

    def __str__(self) -> str:
        return f"{self.export_order_line} — {self.date} ({self.entry_type})"

    @property
    def calculated_pieces(self) -> int:
        """Never manually entered — always system-calculated from the
        entered cartons/pouches (business-rules.md §6).
        """
        line = self.export_order_line
        if self.entry_type == self.EntryType.CARTON_COMPLETED:
            return (self.cartons_packed or 0) * (line.pieces_per_carton or 0)
        return (self.pouches_packed or 0) * (line.pieces_per_pouch or 0)


class Shipment(BaseModel):
    """A shipment can exist before a container is assigned — `container_number`
    is blank until then. No separate `Container` entity (domain-model.md
    §3.8): container attributes live directly here, 1 shipment : 1 container.

    Deliberately narrow V1 field set: only what's needed to *plan* a
    shipment (which SKUs/quantities go on it, roughly when). The fuller
    logistics field set (vessel, booking number, freight forwarder, etc.)
    and the loading lifecycle live on the still-unbuilt Loading/Shipping
    tabs, not here.
    """

    class Status(models.TextChoices):
        PLANNING = "PLANNING", "Planning"
        PACKING = "PACKING", "Packing"
        READY_TO_LOAD = "READY_TO_LOAD", "Ready to Load"
        LOADING = "LOADING", "Loading"
        SHIPPED = "SHIPPED", "Shipped"
        CANCELLED = "CANCELLED", "Cancelled"

    shipment_number = models.CharField(max_length=32, unique=True, editable=False)
    export_order = models.ForeignKey(
        ExportOrder, on_delete=models.CASCADE, related_name="shipments"
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PLANNING)
    planned_container_type = models.CharField(max_length=64, blank=True)
    planned_ready_date = models.DateField(null=True, blank=True)
    planned_stuffing_date = models.DateField(null=True, blank=True)
    container_number = models.CharField(max_length=32, blank=True)
    remarks = models.TextField(blank=True)

    def __str__(self) -> str:
        return self.shipment_number


class ShipmentLine(BaseModel):
    """One SKU's planned quantity on one Shipment — an `ExportOrderLine` can
    be split across several `ShipmentLine` rows on different Shipments.

    `planned_qty` is in pieces, same unit as `ExportOrderLine.required_pieces`
    — that's what its cross-shipment sum is validated against (business
    rule: never over-allocate a SKU past what was ordered). No
    `planned_cartons` column: it's derived, same "derived, not stored" rule
    as everywhere else.

    Loading (business-rules.md §7) is captured via `LoadingTransaction`, a
    separate multi-lot ledger — same "thin anchor + append-only transaction
    ledger" pattern as Production/Procurement/Packing, not a single mutable
    field on this row anymore (superseded design choice — see
    `LoadingTransaction`'s docstring for why). `actual_loaded_cartons`/
    `loaded_pouches`/`actual_loaded_qty`/`difference_cartons`/
    `loading_status` are all computed properties, never stored.
    """

    class VarianceReason(models.TextChoices):
        CONTAINER_SPACE = "CONTAINER_SPACE", "Container space constraint"
        CUSTOMER_APPROVED = "CUSTOMER_APPROVED", "Customer approved adjustment"
        ADDITIONAL_SPACE = "ADDITIONAL_SPACE", "Additional space available"
        PACKING_SHORTAGE = "PACKING_SHORTAGE", "Packing shortage"
        PRODUCT_SHORTAGE = "PRODUCT_SHORTAGE", "Product shortage"
        WEIGHT_RESTRICTION = "WEIGHT_RESTRICTION", "Weight restriction"
        OTHER = "OTHER", "Other"

    class LoadingStatus(models.TextChoices):
        EXACT = "EXACT", "Exact"
        SHORT_LOADED = "SHORT_LOADED", "Short Loaded"
        EXCESS_LOADED = "EXCESS_LOADED", "Excess Loaded"

    shipment = models.ForeignKey(Shipment, on_delete=models.CASCADE, related_name="lines")
    export_order_line = models.ForeignKey(
        ExportOrderLine, on_delete=models.CASCADE, related_name="shipment_lines"
    )
    planned_qty = models.PositiveIntegerField()
    remarks = models.TextField(blank=True)

    def __str__(self) -> str:
        return f"{self.shipment} — {self.export_order_line}"

    @property
    def planned_cartons(self) -> int | None:
        line = self.export_order_line
        if not line.pieces_per_carton:
            return None
        return math.ceil(self.planned_qty / line.pieces_per_carton)

    def _loading_cumulative(self, entry_type: str, field: str) -> int:
        return (
            self.loading_transactions.filter(entry_type=entry_type).aggregate(total=Sum(field))[
                "total"
            ]
            or 0
        )

    @property
    def actual_loaded_cartons(self) -> int:
        return self._loading_cumulative(
            LoadingTransaction.EntryType.CARTON_LOADED, "cartons_loaded"
        )

    @property
    def loaded_pouches(self) -> int:
        return self._loading_cumulative(LoadingTransaction.EntryType.POUCH_LOADED, "pouches_loaded")

    @property
    def actual_loaded_qty(self) -> int:
        """Pieces — both entry types combined, auto-calculated, never
        entered directly (business-rules.md §7 / ui-spec.md §8).
        """
        line = self.export_order_line
        pieces_per_carton = line.pieces_per_carton or 0
        pieces_per_pouch = line.pieces_per_pouch or 0
        return (
            self.actual_loaded_cartons * pieces_per_carton
            + self.loaded_pouches * pieces_per_pouch
        )

    @property
    def difference_cartons(self) -> int | None:
        """Cartons-only, like the old single-field design — loose loaded
        pouches never blend into this figure, same "gross/extra never
        blends into the primary rule" convention Packing follows.
        """
        planned = self.planned_cartons
        if not self.loading_transactions.exists() or planned is None:
            return None
        return self.actual_loaded_cartons - planned

    @property
    def loading_status(self) -> str | None:
        difference = self.difference_cartons
        if difference is None:
            return None
        if difference == 0:
            return self.LoadingStatus.EXACT
        if difference < 0:
            return self.LoadingStatus.SHORT_LOADED
        return self.LoadingStatus.EXCESS_LOADED

    @property
    def last_loading_transaction_at(self) -> datetime | None:
        if self.pk is None:
            return None
        return self.loading_transactions.aggregate(latest=Max("created_at"))["latest"]


class LoadingTransaction(BaseModel):
    """One loading entry against a `ShipmentLine` — same "thin anchor +
    append-only ledger" pattern as `ProductionTransaction`/
    `ProcurementTransaction`/`PackingTransaction`. Supersedes an earlier,
    deliberate V1 design choice (a single mutable `actual_loaded_cartons`/
    `variance_reason` pair directly on `ShipmentLine`, "a stuffing-day
    snapshot, not a ledger") — reversed because the Loading tab rebuild
    needed a real activity feed, matching Fulfilment/Packing.

    Two independent, mutually-exclusive entry types per row, exactly like
    `PackingTransaction`: `CARTON_LOADED` XOR `POUCH_LOADED`. `variance_reason`
    now lives per-transaction, not as a single value on `ShipmentLine` —
    required whenever the *cumulative* total after this entry doesn't
    exactly match `planned_cartons` (business-rules.md §7). A real,
    accepted interim limitation: a still-in-progress partial entry (more
    cartons still to come) will also need a reason until the running total
    reaches the planned figure, since there's no separate "in progress, not
    final yet" state — matches how the old single-snapshot rule always
    treated a not-yet-matching total as a variance.
    """

    class EntryType(models.TextChoices):
        CARTON_LOADED = "CARTON_LOADED", "Cartons Loaded"
        POUCH_LOADED = "POUCH_LOADED", "Pouches Loaded"

    shipment_line = models.ForeignKey(
        ShipmentLine, on_delete=models.CASCADE, related_name="loading_transactions"
    )
    date = models.DateField()
    entry_type = models.CharField(max_length=20, choices=EntryType.choices)
    cartons_loaded = models.PositiveIntegerField(null=True, blank=True)
    pouches_loaded = models.PositiveIntegerField(null=True, blank=True)
    variance_reason = models.CharField(
        max_length=20, choices=ShipmentLine.VarianceReason.choices, blank=True
    )
    remarks = models.TextField(blank=True)

    class Meta:
        ordering = ["-date", "-created_at"]

    def __str__(self) -> str:
        return f"{self.shipment_line} — {self.date} ({self.entry_type})"

    @property
    def calculated_pieces(self) -> int:
        """Never manually entered — always system-calculated from the
        entered cartons/pouches, same rule as `PackingTransaction`.
        """
        line = self.shipment_line.export_order_line
        if self.entry_type == self.EntryType.CARTON_LOADED:
            return (self.cartons_loaded or 0) * (line.pieces_per_carton or 0)
        return (self.pouches_loaded or 0) * (line.pieces_per_pouch or 0)
