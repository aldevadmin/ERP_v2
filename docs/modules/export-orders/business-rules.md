# Export Order Management — Business Rules (V1)

Calculations, validations, statuses, and numbering, all enforced server-side per `CLAUDE.md`'s "backend owns business logic." Entities referenced here are defined in [domain-model.md](domain-model.md). Every rule marked **Tested** must have a corresponding scenario in [acceptance-tests.md](acceptance-tests.md).

## 1. The golden rule

> **Only Accepted quantities from Production and Procurement contribute to Export Order availability, readiness, progress, and planning completion. Gross Produced and gross Received quantities are informational only.**

This must hold identically in: service-layer calculations, API responses, dashboard aggregates, progress percentages, SKU readiness, shipment readiness, reconciliation views, and reports. There is exactly one place this is computed (see §3, "SKU Usable Supply") — every screen and endpoint reads that, none re-derive it independently. **Tested** — this is the single most important scenario in acceptance-tests.md.

## 2. Quantity conversion

**Built** (`backend/apps/export_orders/models.py` — `ExportOrderLine` properties; `serializers.py` — `ExportOrderLineSerializer.validate()`/`create()`/`update()`).

- Internal base unit is always **Piece**. `original_customer_quantity` + `original_customer_unit` (this doc's earlier `CustomerOrderedQty`/`CustomerOrderUnit` — see domain-model.md §3.1 for the field-name deviation) are preserved as received and never overwritten by any conversion or master-data change.
- `required_pieces`:
  - if unit = Piece → `original_customer_quantity`
  - if unit = Pouch → `original_customer_quantity × pieces_per_pouch`
  - if unit = Carton → `original_customer_quantity × pieces_per_pouch × pouches_per_carton`
- `required_pouches = ceil(required_pieces / pieces_per_pouch)`
- `required_cartons = ceil(required_pouches / pouches_per_carton)`
- **Rounding direction is round-up (ceiling)** — recommended default since a "required" quantity that rounds down would under-supply the order. Spec §58 says only "appropriate whole-pack rounding rules must apply" without specifying direction — **flag for PO confirmation**, see §7.
- `pieces_per_pouch` / `pouches_per_carton` are copied onto `ExportOrderLine` from `products.CustomerSKUMapping` (built — see `domain-model.md` §3.2) whenever `product` is set for the first time or changed to a different product, and frozen from then on. A later change to the master config never retroactively changes an existing line unless its `product` is itself re-set. **Tested**
- **Validation**: a `Pouch`/`Carton`-unit line requires a resolvable `CustomerSKUMapping` for `(order.customer, product)` with the needed packing field(s) filled in (`pieces_per_pouch` always; `pouches_per_carton` additionally for Carton). If unresolvable, the API rejects the write with `400` attached to `product` (e.g. "No packing configuration found for this customer/SKU. Set Pieces per Pouch in Customer SKU Mappings first.") — never a silent fallback or a zero-filled computation. `Piece`-unit lines have no such requirement; `required_pieces` is just `original_customer_quantity`. **Tested**

## 3. Planning

- `Planning Balance (input check) = required_pieces − quantity_from_stock − quantity_to_produce − quantity_to_procure` — **Built** (`backend/apps/export_orders/models.py` — `SKUSupplyPlan.planning_balance`; `serializers.py` — `SKUSupplyPlanSerializer.validate()`).
  - Must equal 0 to save a `SKUSupplyPlan`, **unless** `is_intentionally_underplanned = true`, in which case a non-empty `remarks` is required. Enforced at save time (`400` on `planning_balance` or `remarks`, not a DB constraint). **Tested**
  - Over-planning (sum exceeds requirement) is allowed unconditionally — not blocked. **Tested**
- `SKU Usable Supply = Quantity from Stock + Cumulative Accepted Production + Cumulative Accepted Procurement` — **Not built.** Needs cumulative accepted quantities from Production/Procurement transactions, which don't exist yet (§4/§5, still design-only). Do not read this bullet as shipped just because the Planning Balance bullet above is.
- `SKU Supply Balance = required_pieces − SKU Usable Supply` — **Not built**, same reason. The SKU Planning tab's "Plan Balance" column is the *Planning* Balance above (accounts for planned commitments), a different, smaller-scope number than this — see ui-spec.md §5.2.
- A `SKUSupplyPlan` line is **Ready** only when `SKU Usable Supply ≥ required_pieces` — **Not built**, blocked on the same missing data. `planning_status`/`risk_status` are manually set in this slice instead (matching how `risk_status` is already treated elsewhere — see §8).

## 4. Production

**Built** (`backend/apps/export_orders/models.py` — `ProductionRequirement`, `ProductionTransaction`).

- `Production Progress = Cumulative Accepted Production / Planned Production Quantity` — never uses `quantity_produced`. **Tested** (`test_production_model.py::test_worked_example_regression` — Planned 25,000, Produced 26,000, Accepted 23,000, Rejected 3,000 → Available 23,000 / Progress 92% / Balance 2,000 / not Ready)
- `Production Balance = Planned Production Quantity − Cumulative Accepted Production`
- A `ProductionRequirement` becomes `READY` only when cumulative `quantity_accepted` across its `ProductionTransaction` rows meets or exceeds its planned quantity. **Tested**
- `ProductionTransaction.production_requirement` must reference a valid, existing requirement — no orphan transactions (DB-level FK, not nullable). The requirement is created automatically (`get_or_create`) on the first transaction posted against a line, not a separate setup step.
- **Built, inferred**: a transaction's `quantity_accepted + quantity_rejected` cannot exceed `quantity_produced` — you can't accept or reject more than was actually produced. **Tested**
- `ProductionTransaction.party_team` is required (free text, not validated against `vendors.Vendor`) — the Fulfilment tab's entry modal shows Vendor names as autocomplete suggestions only. **Tested**

## 5. Procurement

**Built** (`backend/apps/export_orders/models.py` — `ProcurementRequirement`, `ProcurementTransaction`).

- `Procurement Progress = Cumulative Accepted Procurement / Planned Procurement Quantity` — never uses `quantity_received`. **Tested**
- `Procurement Balance = Planned Procurement Quantity − Cumulative Accepted Procurement`. **Tested** (`test_procurement_model.py::test_worked_example_regression` — Planned 15,000, Received 15,000, Accepted 14,200, Rejected 800 → Available 14,200 / Balance 800 / not Ready)
- A `ProcurementRequirement` becomes `READY` only when cumulative `quantity_accepted` across its `ProcurementTransaction` rows meets or exceeds its planned quantity. **Tested**
- `ProcurementTransaction.procurement_requirement` must reference a valid, existing requirement — no orphan transactions (DB-level FK, not nullable). The requirement is created automatically (`get_or_create`) on the first transaction posted against a line, not a separate setup step.
- `ProcurementTransaction.vendor` is **optional** (`null=True, blank=True`) — reversed from the earlier "required on every transaction" rule. The Fulfilment tab's entry modal now captures `party_team` (required, free text) instead, so a receipt can be logged without first creating a Vendor master record; `vendor` is kept only for existing rows and reporting. **Tested** — both that a transaction succeeds with `vendor` omitted and that `party_team` is still required.
- `ProcurementTransaction.party_team` is required (free text, not validated against `vendors.Vendor`) — same field/rule as `ProductionTransaction.party_team` above. **Tested**
- **Built, inferred**: a transaction's `quantity_accepted + quantity_rejected` cannot exceed `quantity_received` — you can't accept or reject more than was actually received. **Tested**

## 6. Packing

- **Daily Packing Transactions — Built** (`backend/apps/export_orders/models.py` — `PackingTransaction`, one row per daily entry against an `ExportOrderLine`; no `PackingRequirement` anchor — see domain-model.md §3.7 for why):
  - `Calculated Pieces` on a `PackingTransaction`:
    - entry_type = `CARTON_COMPLETED` → `cartons_packed × pieces_per_carton`
    - entry_type = `POUCH_PACKED` → `pouches_packed × pieces_per_pouch`
    - Never manually entered — always system-calculated from the entered cartons/pouches (spec §23–24). **Tested** (`test_packing_transaction_model.py`)
  - Exactly one of `cartons_packed`/`pouches_packed` may be set per transaction, and it must match `entry_type` — a coordinator logs one or the other, never both in the same entry. **Tested** (`test_packing_monitor_api.py`)
  - `Packing % = Cumulative Completed Cartons / Required Cartons` (`ExportOrderLine.packing_progress`). Pouches packed but not yet rolled into a completed carton are shown as a separate `extra_pouches` figure and **must never inflate the headline percentage** — the two sums are independent and never cross-linked. **Tested** — worked example: Required 100, Completed 80, Extra Pouches 150 → Progress 80% (`test_export_order_line_model.py::test_packing_worked_example`).
  - A line only appears in the Packing Monitor (and can receive transactions) when it has a carton configuration (`required_cartons is not None`) — the same gate `PackingMaterialRequirement`'s Cartons/Box Label tabs use. **Tested**
  - `PackingTransaction.packed_by` is required (a real FK to `accounts.Employee`, not free text — a coordinator picks who packed the entry, distinct from `entered_by`/`created_by`, the audit trail of who submitted it). **Tested**
  - `PackingTransaction.shift_team` is optional free text (not validated against `accounts.Team`) — same UX pattern as Fulfilment's `party_team`, but not required. **Tested**

**Packing readiness (pieces-based) — Built**, added for the Packing tab rebuild (ui-spec.md §5.6): `Packable Qty = ExportOrderLine.required_pieces` — **not** bounded by Fulfilment's cumulative Accepted Qty; a deliberate, confirmed decision (the two figures are unrelated, unlike the golden rule's Accepted-only framing for Fulfilment/Overview). `Packed Qty (pieces) = packed_cartons × pieces_per_carton + extra_pouches × pieces_per_pouch` — combines both entry types into one pieces figure (unlike the cartons-only `Packing %` rule above, which is untouched and still used by the Packing Monitor screen, ui-spec.md §6). `Balance (pieces) = Packable Qty − Packed Qty`, unclamped. Readiness status reuses the same "risk_status + Complete override" pattern as Fulfilment (§8 below): Complete once Packed Qty (pieces) ≥ Packable Qty.
- **Packing Material Requirement — Built** (`backend/apps/export_orders/models.py` — `PackingMaterialRequirement`, one row per (`ExportOrderLine`, `material_type`), 4 fixed types: Cartons, Pouches, Retail Stickers, Box Labels — no Silica Gel tracking in V1):
  - `CARTON`/`POUCH` required quantities reuse `ExportOrderLine.required_cartons`/`required_pouches` as-is — auto-calculated, not manually entered.
  - `RETAIL_STICKER` required quantity = `required_pouches` (a fixed 1:1 ratio), and only when the line's snapshotted `has_retail_sticker` flag (copied from `products.CustomerSKUMapping` at line creation) is true — otherwise `0`. **Tested** (`test_export_order_line_model.py`)
  - `BOX_LABEL` has no formula anywhere in `products.CustomerSKUMapping` — its required quantity is manually entered (`manual_required_qty`), the one deliberate exception to "derived, not stored" for this feature. Writing `manual_required_qty` for any other `material_type` is rejected. **Tested** (`test_packing_material_api.py`)
  - `Shortage = max(required_qty − available_stock, 0)`, always computed. **Tested** — worked example: Required 1,000 cartons, Stock 600 → Shortage 400 (`test_packing_material_model.py::test_worked_example_shortage`).
  - `available_stock`, `ordered_qty`, `expected_arrival_date`, `received_qty`, `accepted_qty`, `responsible_person`, `status`, `remarks` are all plain manually-entered fields (V1 allows manual updates; no Inventory/Procurement system behind them) — same pattern as `SKUSupplyPlan`, not the Requirement+Transaction ledger used by Production/Procurement.
  - `To Procure = manual_to_procure_qty if set, else Shortage` — a coordinator can procure more than the bare shortfall (e.g. a buffer for expected packing damage), for any material type, not just `BOX_LABEL`. Not clamped to `Shortage` either direction; the override is a judgment call the backend stores and returns as-is. **Tested** — worked example: Required 1,000, Stock 600 → Shortage 400, override to 500 → To Procure 500 (`test_packing_material_model.py::test_to_procure_qty_uses_manual_override_when_set`).

## 7. Loading & shipment

**Shipment planning — Built** (`backend/apps/export_orders/models.py` — `Shipment`, `ShipmentLine`; see domain-model.md §3.8 for the full field-scope deviation from the original sketch):

- **One container = one customer.** Because `Shipment.export_order` is a required FK to a single `ExportOrder` (which belongs to a single `Customer`), and V1 has no cross-order shipment consolidation, this rule is guaranteed structurally — no extra validation code is required *as long as multi-order consolidation is never introduced without revisiting this rule explicitly*. **Tested** (`test_shipment_api.py::test_cross_order_line_rejected` — a structural/negative test: no code path can attach lines from two different export orders to one shipment).
- `ShipmentLine.export_order_line` must belong to the same `ExportOrder` as `ShipmentLine.shipment.export_order`. Enforced in `ShipmentLineSerializer.validate()` on create/update. **Tested**
- A SKU can be **split across multiple Shipments** via `ShipmentLine`, but never over-allocated: the sum of `planned_qty` across every `ShipmentLine` for the same `export_order_line` (across all its Shipments) can never exceed `ExportOrderLine.required_pieces`. **Tested** (`test_shipment_api.py::test_worked_example_split_sku_across_shipments`, `test_over_allocation_rejected`).
- A Shipment can exist before a container number is known — `container_number` is blank at creation and assignable later via `PATCH`, no separate `Container` entity or provisional row.

**Loading — Built** via `LoadingTransaction`, a real append-only ledger (domain-model.md §3.8.1) — **superseded** an earlier deliberate choice to keep `actual_loaded_cartons`/`variance_reason` as single mutable fields directly on `ShipmentLine`; reversed for the Loading tab rebuild (ui-spec.md §8), which needed a real activity feed matching Fulfilment/Packing. Existing data was preserved via a data migration, not discarded (domain-model.md §3.8).

- Exactly one of `cartons_loaded`/`pouches_loaded` may be set per `LoadingTransaction`, matching `entry_type` — same rule as `PackingTransaction`. **Tested**
- `loading_status` is still auto-computed, in cartons (ui-spec.md §8's stated entry/display unit), now reading the *cumulative* `actual_loaded_cartons` property: `== planned_cartons` → `EXACT`; `<` → `SHORT_LOADED`; `>` → `EXCESS_LOADED`; `None` until a transaction exists. **Tested**
- `variance_reason` is now **per-transaction**, not one value per `ShipmentLine` — required whenever the cumulative total *this entry would produce* doesn't exactly equal `planned_cartons`, enforced in `LoadingTransactionSerializer.validate()`. Still a **fixed 7-option choice field, not free text**: Container space constraint, Customer approved adjustment, Additional space available, Packing shortage, Product shortage, Weight restriction, Other (the `ShipmentLine.VarianceReason` enum, reused by `LoadingTransaction`). **Tested**, including the accepted interim limitation that a still-in-progress partial entry needs a reason too (no separate "in progress" state exists to exempt it).
- No approval workflow gates a loading variance in V1 — recording the reason is sufficient (spec §32, explicit): the entry just saves once a reason is present, nothing else checks or approves it.
- Cartons packed but not loaded onto a shipment return to `Product.available_qty` (business-rules.md/domain-model.md §2.4 — a narrower, Loading-only version of the "finished-stock placeholder" than originally sketched) rather than staying locked to the Export Order. **Built as an idempotent delta, not a literal `+=`** — see domain-model.md §3.8's "Stock-return reconciliation" for why a naive `available_qty += (packed − loaded)` would double-credit a SKU split across shipments or a corrected loading entry. **Tested** (`test_shipment_api.py::test_stock_return_*`).
- Shipment quantities can never silently change the original PO quantity — `ExportOrderLine.customer_ordered_qty` / `required_pieces` are immutable once set except through a tracked PO revision (§9). Loading only ever reads `required_pieces`/`required_cartons`, never writes them.

## 8. Statuses

### Export Order status
`Planning → Fulfilment → Packing → Loading → Shipped → Complete`, with `Cancelled` reachable from any pre-Shipped state.

**Built** (`ExportOrder.Status`, `ExportOrder.STAGE_SEQUENCE`), including the transition mechanism itself — as of the Phase 1 Overview-tab redesign, `status` genuinely advances now, not just exists as an unreachable enum. `Fulfilment` is a new value inserted between `Planning` and `Packing`, added specifically so the Overview tab's Order Progress widget (ui-spec.md §5.1) has something real to display for the Fulfilment tab's activity, distinct from Planning. `status` is still not free-editable (`read_only_fields` in `ExportOrderSerializer`); the two write paths are `POST /export-orders/{id}/cancel/` (unchanged) and the new `POST /export-orders/{id}/advance/`.

- **Advancement is manual, coordinator-driven** (`CanManageExportOrders`) — `advance` moves to the *next* value in `STAGE_SEQUENCE` and logs an `ExportOrderStageEvent` (domain-model.md §3.1). This deliberately does **not** implement the "Auto-transition triggers" proposal below — that PO-confirmation question was never answered, and guessing wrong (e.g. auto-advancing to Packing on a stray test transaction) is a worse failure mode than requiring a deliberate click. If the PO later confirms specific auto-trigger rules, `advance` can be called from those trigger points too — it doesn't preclude automation, it just doesn't assume it.
- **"Mark as Loaded" (Loading tab rebuild)** — a header button, shown only while on the Loading tab, that calls the same `advance` action (not a new endpoint) — a manual, explicit click, same governance as the header's "Advance to Next Stage" menu item. Disabled unless `status === 'LOADING'`. Still not an auto-trigger — the open question below is unaffected.
- Each stage's `entered_at`/`completed_at` shown on Overview is exact from the moment `ExportOrderStageEvent` tracking began; orders that existed before it (migration `0011_backfill_stage_events`) only have a real date for whatever stage they were in *at migration time* — earlier stages show "Completed" with no date, not a fabricated one.
- **Complete** is still a manual confirmation in V1 (unchanged from before) — **flag for PO confirmation on who is authorized to confirm it and whether any checklist gates it**, see §7 open questions.
- An Export Order can have multiple Shipments in different phases simultaneously. The header `status` is **not** derived from Shipment statuses (the "least-advanced status among Shipments" proposal below remains unbuilt) — it only moves via explicit `advance`/`cancel`. **Flag for PO confirmation**, see §7.

### Auto-transition triggers (still an open question — not built)
The spec doesn't specify exact trigger conditions for header/shipment status changes, and this hasn't changed with the `advance` action above — `advance` is a deliberately dumb "move to next stage" primitive, not an implementation of any of these proposed rules. **Flag for PO confirmation**:
- `Planning → Fulfilment`/`Packing`: first `ProductionTransaction`/`ProcurementTransaction`/`PackingTransaction` recorded against any line on the order.
- `Packing → Loading`: first `LoadingTransaction` recorded on a shipment.
- `Loading → Shipped`: an explicit "mark shipped" action, or a Shipment reaching `SHIPPED`.
- `Shipped → Complete`: manual only (see above).
- The header status derived from Shipment statuses ("least-advanced status among non-cancelled Shipments").

If any of these are confirmed, the natural implementation is to call the existing `advance` logic from that trigger point — not to build a second, parallel status-setting path.

### Shipment status
`Planning → Packing → Ready to Load → Loading → Shipped`, with `Cancelled` reachable pre-Shipped (not explicitly enumerated in the functional spec — proposed set). **Built** (`Shipment.Status`) — same framing as Export Order status: the full enum exists now so the field never needs a migration later, but in the current planning-only slice **only `Planning` and `Cancelled` are meaningfully reachable** — nothing downstream drives the other transitions yet (Packing/Loading/Shipped need the still-unbuilt Loading module). `status` is a plain writable field in this slice, not workflow-gated. **Flag for PO confirmation** on the exact transition rules once Loading exists.

### Requirement / planning status
Shared across `SKUSupplyPlan`, `ProductionRequirement`, `ProcurementRequirement`, `PackingMaterialRequirement`: `NOT_STARTED, IN_PROGRESS, READY, DELAYED`.

### Risk status
`ON_TRACK, AT_RISK, DELAYED` — manually set in V1 across Export Order Line, SKU Supply Plan. No automatic risk engine (explicitly out of scope, spec §61).

**Fulfilment tab readiness status** (`FulfilmentReadinessStatus`, frontend-only presentation, not a stored field): reuses `SKUSupplyPlan.risk_status` (`ON_TRACK`/`AT_RISK`/`DELAYED`) for a SKU's readiness row, **overridden to `COMPLETE`** once `cumulative_accepted (Production + Procurement) >= planned_qty` for that SKU — computed client-side from the same figures the golden rule already treats as authoritative (§1), not a new backend enum value. If no `SKUSupplyPlan` row exists for a SKU, defaults to `ON_TRACK` rather than leaving the tag blank. The Packing tab's readiness table reuses this exact same component/type (`FulfilmentStatusTag`) with its own Complete condition (Packed Qty (pieces) ≥ Packable Qty, §6 above) — one shared "readiness status" concept across both tabs, not two parallel implementations. The Loading tab's readiness table reuses it a third time — Complete once Loaded Qty (pieces) ≥ Loadable Qty (`planned_qty`), replacing the earlier Pending/Exact/Short Loaded/Excess Loaded tag vocabulary in that table (`loading_status`'s EXACT/SHORT_LOADED/EXCESS_LOADED still exists backend-side, driving the `variance_reason`-required rule in §7, just no longer the UI's readiness-table label).

### Document status
`PENDING, READY, SUBMITTED, RECEIVED` on `ShipmentDocument`.

## 9. PO revisions

- Creating a new `ExportOrderPOVersion` never deletes or overwrites a prior version — `is_current` moves to the new row, history stays queryable. **Built** (`backend/apps/export_orders/serializers.py` — `ExportOrderPOVersionSerializer.create()`), with `version_number` computed under a `select_for_update()` lock on the parent order to serialize concurrent uploads.
- `ExportOrderLine` rows are updated in place against the current PO version (not duplicated per version); field history (via the `audit` app) is what lets a coordinator see what changed between versions. See domain-model.md §6 open question #7 on whether this needs a first-class "view order as of PO v1" screen instead. Not yet applicable — `ExportOrderLine` isn't built (domain-model.md §3.1).

## 10. Numbering

- `ExportOrder.order_number` and `Shipment.shipment_number` are generated via the reusable sequence utility (`core`), not user-entered.
- Shipment numbering: `{export_order.order_number}-S{seq:02d}`, e.g. `EO-2026-0045-S01`. **Built** — `ShipmentSerializer.create()` calls `Sequence.next_value(f"shipment:{export_order.order_number}")`, keyed per export order so each order's shipments count `S01, S02, …` independently (not a global counter). **Tested** (`test_shipment_api.py::test_shipment_numbering_scoped_per_order`).
- **Built for Export Order numbering, reused as-is for Shipment numbering**: `core.Sequence.next_value(key)` (`backend/apps/core/models.py`) is a named, atomically-incrementing counter (`select_for_update()` inside `transaction.atomic()`). `ExportOrder.order_number` format is `EO-{year}-{seq:04d}` (e.g. `EO-2026-0001`), keyed per calendar year (`export_order:{year}`) so the sequence resets each year — this is the format flagged as needing PO confirmation below; shipped as the default rather than blocking the slice on it.
- Exact Export Order number format (prefix, year segment, reset frequency) is configurable — **PO input required**, tracked as decision #8 in the architecture proposal.

## 11. Audit & corrections

- Every `export_orders` model carries `created_by/created_at/updated_by/updated_at` and opts into field history.
- V1 allows authorized users to directly edit a mistaken entry (no separate reversal/correction transaction type) — history is what preserves the trail. This applies to all transactional entities but **is called out as particularly sensitive for `quantity_accepted` on Production Transactions and Procurement Receipt Lines**, since a correction there directly moves Export Order readiness (spec §56). **Tested** — corrections to accepted quantity must be visible in history with old/new values.
- Changes to `ExportOrder.planned_ready_date` go through `DateRevision` (domain-model.md §2.7), capturing previous/new date and a reason — this is required, not optional, for that one field in V1.

## 12. Notification triggers

In-app only in V1 (no email/WhatsApp). Fired via `notifications.notify()` from `export_orders` service functions on:

- New Production Requirement / Procurement Requirement assigned
- Packing material shortage detected
- Expected completion date missed
- Shipment approaching Planned Ready Date
- Packing delayed
- Container assigned
- Shipment loaded
- Shipment sailed (status → Shipped)

"Accepted Production/Procurement behind plan" triggers are explicitly deferred by the spec to a later phase (§57) — not implemented in V1.

## 13. Access & visibility

- Customer portal users see only their own Customer's Export Orders/Shipments, and only the fields the spec whitelists for customer visibility (PO number, order status, packing progress, planned ready date, container number, ETD, ETA, shipping line, documents marked `customer_visible=true`, `customer_remarks`). Everything else (vendor names, internal remarks, cost data, risk discussion, staff comments, internal responsibility fields) is never serialized into a customer-facing response — enforced by using a dedicated customer-facing serializer, not a field-visibility flag checked ad hoc per field. **Tested**
- Staff role permissions per the matrix in [ui-spec.md](ui-spec.md) — enforced via DRF permission classes checking Group membership, consistent with the platform-wide "Groups/Permissions, no custom RBAC engine" decision.
- Every transaction retains `entered_by` / `source` regardless of who is allowed to enter it — this is what lets the Export Coordinator's V1 manual-entry fallback (spec §43) stay accountable.

---

## Open questions for Product Owner

1. **Rounding direction** for pouch/carton conversion — this doc assumes round-up (ceiling); confirm.
2. **Export Order header status aggregation** across multiple shipments in different phases — this doc assumes "least-advanced shipment," confirm or propose an alternative.
3. **Shipment status value set** — proposed above, not in the spec verbatim; confirm.
4. **Auto-transition trigger conditions** for both Export Order and Shipment status — proposed above; confirm or adjust.
5. **"Complete" confirmation** — who is authorized, and is any checklist/condition required before it can be set, beyond "shipment obligations are done"?
6. **Procurement receipts without a formal requirement** — the spec's packing-material procurement flow implies some receipts (e.g. ad-hoc packing material purchases) may not trace back to a `ProcurementRequirement`. Confirm `ProcurementReceiptLine.procurement_requirement` should be nullable for that case, and how such receipts still tie back to a `PackingMaterialRequirement` instead.
