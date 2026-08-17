# Export Order Management — UI Spec (V1)

Screens, navigation, terminology, and permissions for the internal app and the customer portal. Built in React + TypeScript + Ant Design, frontend stays presentation-only per `CLAUDE.md` — every number shown here is computed server-side and simply rendered.

Design constraints from `CLAUDE.md` apply throughout: simple, minimalist, low cognitive load, large controls, task-oriented, familiar business terms, no ERP jargon exposed to operators.

## 1. Navigation

Top-level, exactly as the functional spec specifies (§65) — no more:

**Dashboard · Export Orders · Packing Monitor · Shipments · Customers · Products · Masters**

Internal implementation concepts (Production Transaction, Supply Allocation, Procurement Receipt Line, etc.) never appear as navigation items or screen titles — they surface only as data inside the screens below.

**Built** (Phase 1 of an app-wide visual/navigation redesign, `frontend/src/app/AppSidebar.tsx`) as a collapsible left sidebar rather than the horizontal top menu used previously — **Dashboard · Export Orders · Customers · Products · Vendors · Settings**. Packing Monitor and Shipments aren't separate nav entries (Packing Monitor is embedded per-order, §6; Shipments planning now lives inside the Shipping tab, §5.7); Masters isn't built. Vendors and Settings are new: Vendors is a minimal read-only list (the backend `Vendor` API is deliberately read-only, admin-managed — no nav entry existed for it before); Settings is a placeholder pending scope. Further phases (Inventory, Purchase Orders, Reports, a real Dashboard) get their own nav entries only once built — no placeholder/dead links are added ahead of that.

## 2. Terminology glossary

Every label a user sees must come from this table, not the internal field/model name. Extend this table (don't invent new jargon-y labels) as new fields are added.

| Internal concept | User-facing label |
|---|---|
| Production Supply Allocation / `quantity_to_produce` | Need to Produce |
| QC Released Production Quantity / `quantity_accepted` (production) | Accepted from Production |
| External Procurement Requirement Allocation / `quantity_to_procure` | Need to Procure |
| Accepted Goods Receipt Quantity / `quantity_accepted` (procurement) | Accepted from Vendor |
| Fulfilment Completion Quantity | Packed |
| Material Availability Commitment Date | Ready Date |
| `quantity_produced` (gross) | Produced (shown only in drill-down, never as the headline number) |
| `quantity_received` (gross) | Received (drill-down only) |
| SKU Usable Supply | Ready Quantity |
| SKU Supply Balance | Balance |
| Planning Status | Status |
| `is_intentionally_underplanned` | "Planned short — reason required" |

## 3. Dashboard

Answers "what needs attention today." Sections, in order:

| Section | Shows |
|---|---|
| Upcoming Shipments | Customer, Export Order, Shipment, Planned Ready Date, Planned Stuffing Date, Overall Progress, Risk |
| Orders at Risk | Orders/SKUs marked At Risk or Delayed |
| Production Status | **Accepted / Planned** (e.g. "23,000 / 25,000 — 92%") as the headline number; Produced/Rejected only on drill-down |
| Procurement Status | **Accepted / Planned**, same pattern |
| Packing Material Shortages | Materials at risk of delaying packing |
| Packing Progress | Planned cartons, packed cartons, %, target vs actual |
| Today's Actions | Generated task list from outstanding requirements (overdue dates, unassigned requirements, missing variance reasons, etc.) |

## 4. Export Order List

Design columns: Export Order No., Customer, Customer PO, PO Date, Destination, Planned Ready Date, Shipment Count, Planning %, Packing %, Current Phase, Risk, Coordinator.
Design filters: Customer, Coordinator, Status, Planned Ready Date, Country, Risk, Shipment Status.

**Built** (`ExportOrderListPage.tsx`), narrower than the design sketch above — no Shipment Count/Planning %/Packing %/Risk/Coordinator columns (Risk isn't modeled anywhere yet; the % figures would need a cross-module rollup not built for the list view). Actual columns: **Order No., Customer, PO No., Order Date (`customer_po_date` — the closest existing field to a literal "order date"), CRD (`planned_container_ready_date`), Status** (`ExportOrderProgressStepper`, §5's colored-dot stepper), **Container** (the earliest linked Shipment's `planned_container_type` — a summary, not authoritative for orders split across multiple Shipments with different container types), **Stage** (`ExportOrderStatusTag`, a colored text tag of the same `status` value the stepper renders, offering a compact label alongside the dots), and a row **Actions** menu (View / Edit / Cancel Order — Cancel calls the existing `cancel` endpoint after a confirm dialog).

Filters: **Search** (order number/PO number/customer name, existing `search` query param), **Customer** (dropdown, `customer` query param — already supported server-side), **Status**, and a **CRD From/To** date range (new `crd_from`/`crd_to` query params on `ExportOrderViewSet.get_queryset`, filtering `planned_container_ready_date__gte/lte`). All five are draft inputs applied together on **Filter** (not fired per-keystroke) — **Reset** clears every field and reloads unfiltered. Coordinator/Country/Risk/Shipment Status filters from the design sketch aren't built (no Risk model, no Shipment Status rollup at the order level).

Pagination is real server-side paging (DRF `PageNumberPagination`, page size 20) — `showTotal` renders "Showing X to Y of Z orders".

## 5. Export Order Detail

Tabbed layout — one order, one screen, no unrelated ERP navigation:

**Overview · Order Lines · Planning · Fulfilment · Packing · Loading · Shipping · Documents · Activity/History**

"Order Lines" is inserted here, ahead of "Planning" — not in the original tab list above, which assumed lines already existed by the time planning needed them. **Built** as seven top-level tabs (`frontend/src/modules/export-orders/ExportOrderDetailPage.tsx`, an AntD `Tabs` shell): `overview`, `lines`, `planning`, `fulfilment`, `packing`, `loading`, `shipping`; `documents`/`activity` are not built yet.

**Regrouped twice.** First from an earlier flat 10-tab layout (SKU Planning, Production, Procurement, and the 4 Packing Materials tabs were previously all top-level) once the tab bar got too wide for daily use. Then, as part of the Phase 1 visual/IA redesign, the former **Gathering** tab (nested Production/Procurement sub-tabs) was replaced by **Fulfilment** and the former standalone **Shipments** tab (shipment planning) was folded into **Shipping**:
- **Planning** (`ExportOrderPlanningTab.tsx`) nests SKU Planning (§5.2) and the 4 Packing Materials tabs (§5.5) — a second, bare AntD `Tabs` bar inside the tab's content, same visual pattern as the outer one. Defaults to SKU Planning.
- **Fulfilment** (`ExportOrderFulfilmentTab.tsx`, replacing `ExportOrderGatheringTab.tsx`) presents Production (§5.3) and Procurement (§5.4) as **one combined SKU Readiness table**, a separate order-wide **Recent Fulfilment Transactions** table, and **one "Add Fulfilment Transaction" modal** (a Source select toggling between the two) instead of two nested sub-tabs — see §5.3 for the rebuilt layout. Mostly a presentation-layer merge — `ProductionRequirement`/`ProductionTransaction` and `ProcurementRequirement`/`ProcurementTransaction` remain two separate backend models with their own per-line write endpoints (api-spec.md §3/§4); the modal posts to whichever endpoint matches the chosen Source. It did require two small, real backend additions to support the merged UI: a `party_team` field on both transaction models (replacing a dedicated Vendor picker) and a new order-wide read endpoint for the transactions table (api-spec.md §4.1) — see business-rules.md §4/§5 for the field-level rule changes.
- **Loading** is real (`ExportOrderLoadingTab.tsx`, §8, restructured in Phase 1 to a readiness table + "Update Loading" modal) — actual loaded cartons, difference, status, and reason, per Shipment. **Shipping** (`ExportOrderShippingTab.tsx`, replacing `ExportOrderShipmentsTab.tsx`) is real for shipment *planning* (§5.7) — the fuller logistics/shipping-information fields, document tracker, and progress stepper (§9) are a later phase, not built yet.
- The nested tabs' active sub-tab is in-page state only, not reflected in the URL (the route stays `/export-orders/{id}/planning` regardless of which sub-tab is open) — a deliberate simplicity trade-off: a direct link always lands on the group's default sub-tab, not necessarily the one last viewed.

**Header chrome, built** (`ExportOrderDetailPage.tsx`, Phase 1 redesign): a breadcrumb (`Export Orders / EO-XXXX`) above the title; the order number + Stage tag, with CRD/Container as small quick-facts beneath; an **Edit Order** button; and a kebab (`⋮`) menu holding **Advance to Next Stage** (hidden once `Complete`/`Cancelled`, business-rules.md §8) and **Cancel Order** (hidden once already `Cancelled`). Below that, a compact info strip repeats Customer/PO No./Order Date/CRD/Container/Stage before the tab bar — the same fields the Export Orders list shows per row (§4), so the two screens read consistently.

### 5.1 Overview

- Header: Customer, PO Number, Export Order Number, Planned Ready Date, Current Phase, Overall Risk.
- Phase progress bars: Planning, Packing, Loading, Shipping (%).
- SKU Summary, Packing Progress, Shipment Summary, Outstanding Actions.
- Any readiness number shown here is always **Stock + Accepted Production + Accepted Procurement** — never gross Produced/Received (this is a UI-level restatement of the golden rule in business-rules.md; there is no code path where the UI would need to compute this itself, but it must never be given the gross fields to render by mistake).

**Built** (`ExportOrderOverviewTab.tsx`), restructured for the Phase 1 detail-page redesign (screenshot-driven, see the app-redesign roadmap). No SKU/Packing/Shipment summaries or a risk indicator yet — that "Overall Risk"/health concept (distinct from the Stage tag) was explicitly deferred, not built, when this pass was scoped.

Current layout:
- **Order Details** / **Other Details** — two plain label/value columns (not the old bordered `Descriptions` blocks), all real existing fields: Order No./Customer/PO No./Order Date/CRD/Container/Incoterm/Origin Country/Destination Port/Currency on the left; Export Coordinator/Requested Shipment Date/Payment Terms/Bill To/Ship To/Remarks on the right. `Container` reads the same `container_type` computed field the list page uses (§4).
- **Order Progress** — a 5-stage widget (Planning/Fulfilment/Packing/Loading/Shipping) driven by `ExportOrder.stage_history` (domain-model.md §3.1): a filled checkmark circle + "Completed {date}" for stages already passed, a highlighted current-dot circle + "Since {date}" for the current stage, an empty circle + "Pending" for what's ahead. Advancing between stages happens via the header's "Advance to Next Stage" action (§5), not from this widget.
- **PO Documents** — unchanged, kept from the prior layout (revision history table + Upload New Revision).
- **Notes / Next Steps** — new: a plain chronological list (author + date + text) of `ExportOrderNote` rows, with an **Add Note** button opening a small modal (one required text field). No edit/delete — a correction is a new note.

The screenshot's "Additional Information" panel (Sales Representative, Freight Forwarder, Vessel/Voyage, ETD/ETA, Commodity, HS Code) was explicitly **not built** in this pass — several of those fields belong to the still-unbuilt Shipping logistics buildout (§5.7, §9), and the rest (Commodity, HS Code) have no home in the current data model. Revisit once that phase is scoped.

### 5.1a Order Lines

**Built** (`ExportOrderLinesTab.tsx`) — the customer's PO line items, captured per SKU: Customer SKU, Customer Description, Internal SKU, Internal Description (read-only, from the linked Product), Original Customer Quantity, Original Customer Unit (Pieces/Pouches/Cartons), plus the backend-computed Pieces per Pouch, Pouches per Carton, Pieces per Carton, Converted Piece Requirement, Required Pouches, **Required Stickers**, Required Cartons (business-rules.md §2/§6 — the frontend never computes these).

The Required Pouches/Required Stickers/Required Cartons cells each carry a small info icon (`Popover`) showing that SKU's live Cartons/Pouches/Retail Stickers status — Available Stock, Shortage, Ordered, Expected Arrival — sourced from the matching Packing Materials tab (§5.5) without navigating away from Order Lines.

Distinct from §5.2 SKU Planning below: this tab only captures what was ordered and its piece-equivalent conversion. It has no Stock/Production Accepted/Procurement Accepted/Ready Qty/Balance/Risk columns — those require Production/Procurement/Inventory data that doesn't exist yet. SKU Planning will consume this tab's `product`/quantity once built, not duplicate them.

Entry is a rapid, spreadsheet-like row (Customer SKU autocomplete sourced from Customer SKU Mappings, Customer Description, Internal SKU, Quantity, Unit, "Add Line") rather than a modal-per-line form — built for coordinators entering 10-50 SKUs per order. A Customer SKU match auto-fills Customer Description/Internal SKU from the existing mapping; typing an unmapped SKU is still accepted for Pieces-unit lines (Pouches/Cartons require a resolvable packing configuration — business-rules.md §2). Existing lines are edited in place (pencil icon) and removed via a delete icon with confirmation.

### 5.2 SKU Planning

Design table: SKU, Order Qty, Stock, Production Accepted, Procurement Accepted, Ready Qty, Balance, Expected Ready, Status, Risk. Row click → SKU detail drawer/page with: Requirement, Stock, Production, Procurement, Packing Materials, Timeline, Remarks. Production drill-down separately shows Produced/Accepted/Rejected; Procurement drill-down separately shows Received/Accepted/Rejected — gross figures are drill-down-only, never the primary number.

**Built** (`ExportOrderSkuPlanningTab.tsx`), with one column dropped from the design table above — "Ready Qty" (Stock + Production Accepted + Procurement Accepted, i.e. true SKU Usable Supply) is now technically computable, since both Accepted figures exist, but wasn't built in this slice: it also needs the auto-derived `planning_status` logic from business-rules.md §3, which is a distinct, not-yet-requested change. Flagged as a natural next step, not assumed. "Production Accepted" and "Procurement Accepted" are both built, as plain columns reading `accepted_from_production`/`accepted_from_procurement` (§3.4/§3.5's `cumulative_accepted`) — the Production (§5.3) and Procurement (§5.4) tabs are where the underlying data comes from; this tab only surfaces the Accepted/Required headline per source, not the full drill-down. Actually-built table: SKU, Order Qty, **Production Accepted**, **Procurement Accepted**, Stock, Need to Produce, Need to Procure, **Plan Balance**, Expected Ready, Status, Risk, Responsible.

"Plan Balance" is deliberately not the glossary's bare "Balance" (§2: `SKU Supply Balance` → "Balance"). It's a different, smaller-scope number — `required − (stock + produce + procure)`, i.e. does the *plan* add up — not `required − usable supply` (which needs the accepted-quantity data above). Reusing "Balance" now would mean the same header silently changes meaning the day Production/Procurement ship. **Flagged for PO confirmation** — open to a better label if "Plan Balance" reads awkwardly.

Row click opens a `Drawer` (not the "SKU detail drawer/page" full multi-section drill-down sketched above — Production/Procurement/Packing Materials/Timeline sections all need modules that don't exist yet) with: read-only Required Quantity; Quantities (Stock/Need to Produce/Need to Procure, a live client-side balance *preview* for typing feedback only — the persisted `planning_balance` shown in the table always comes from the save response, never the preview — plus "Planned short — reason required" once the preview goes positive, per the glossary's `is_intentionally_underplanned` label); Production (Planned Start Date, Expected Completion Date); Procurement (Planned Order Date, Expected Receipt Date) with a read-only Expected Ready readout; Responsibility (Responsible Person, Responsible Team); Status (Status, Risk); Remarks.

### 5.2a Planning v2 (screenshot-driven alternate layout)

**Built** (`ExportOrderPlanningV2Tab.tsx`, top-level tab `planning-v2`, sitting alongside — not replacing — Planning/§5.2) — a second, denser presentation of the same planning data, requested to match a specific mockup rather than to change what's built. Two inline-editable tables in one screen, no drawer:

- **Line Item Planning**: SKU, Ordered Qty, Stock (`quantity_from_stock`, read-only display), **Use Stock**/**Produce**/**Procure** (all editable inline, same fields `SKUSupplyPlan` already has), ETA, with a Total row. "Save Planning" persists every changed row through the existing `updateSkuSupplyPlan` endpoint — no new backend field for this table.
- **Packing Material Planning by SKU**: every material type's `PackingMaterialRequirement` rows for the order, flattened into one table grouped by SKU (rowspan), Material, Required, **Available** (editable, `available_stock`) and **To Procure** (editable, `manual_to_procure_qty` — business-rules.md §6) in the same "Save Planning" batch, "Place Order" (disabled once To Procure reaches 0; not wired to anything, same as Export to Excel/Generate Material POs).
- "Actual Dimensions" and "Preferred Vendor" are shown as `—` — no backing field exists for either; adding them wasn't part of what was asked, and showing fabricated values would be worse than an honest blank.
- Editing Available and editing To Procure are independent — raising Available does **not** auto-update a To Procure the coordinator hasn't touched, and vice versa (a naive live-recompute existed briefly during this feature's build and was removed once To Procure became genuinely editable, since it would have silently turned every Available edit into a frozen manual override).

### 5.3 Production

**Built**, no longer its own top-level UI tab — presented jointly with Procurement inside **Fulfilment** (§5, `ExportOrderFulfilmentTab.tsx`), which replaced the standalone `ExportOrderProductionTab.tsx`/`ExportOrderGatheringTab.tsx` component pair. Rebuilt (screenshot-driven, matching a specific mockup) as two stacked `SectionCard`s, not the earlier "expanding row" drill-down design:

- **SKU Readiness table** — one row per SKU that has planned Production and/or Procurement (a Set-union of both requirement lists by line ID, so a SKU with only planned Procurement and zero planned Production still gets a row — a regression this build specifically guarded against). Columns: SKU (code + product name), Planned Source ("Production" / "Procurement" / "Production + Procurement"), Planned Qty (both sources summed), Accepted Qty (both sources summed — the golden-rule figure, never gross Produced/Received), Balance, Last Update (`last_transaction_at`, the later of Production's/Procurement's), a `Progress` bar, a **Status** tag, and a per-row **Add Transaction** action. A SKU-filter `Select` and an **Add Manual Transaction** button sit in the card header.
- **Status** tag (`FulfilmentStatusTag.tsx`) — reuses `SKUSupplyPlan.risk_status` (On Track/At Risk/Delayed), overridden to **Complete** once Accepted Qty ≥ Planned Qty for that SKU (business-rules.md §8 "Fulfilment tab readiness status"). Defaults to On Track if no supply plan row exists yet.
- **Recent Fulfilment Transactions table** — a second `SectionCard` below the readiness table: the order-wide, paginated transaction log (api-spec.md §4.1), independently filterable by SKU (its own `Select`, separate from the readiness table's filter) and paginated 20 rows/page. Columns: Date, SKU, Source (Production/Procurement tag), Party/Team, Received or Produced, Accepted, Rejected, Remarks, Recorded By.

The **"Add Fulfilment Transaction"** modal (`AddFulfilmentTransactionModal.tsx`, replacing the old inline daily-entry row) opens from either the header's **Add Manual Transaction** button (SKU field open, required) or a readiness row's **Add Transaction** action (SKU field **pre-selected and locked** — `disabled`, so the entry can't land on the wrong SKU). Fields: SKU, Source (defaults to Production), **Party / Team** (see below), Transaction Date (a plain `DatePicker`, not the mockup's "Date & Time" — the backend `date` field has no time component, and adding an uncaptured time field would be silently discarded, so the label was scoped to what's actually stored), Received or Produced Qty, Accepted Qty, Rejected Qty (defaults 0), a read-only "Unit: pcs" display, Remarks. Choosing Production posts to `production-transactions/`; choosing Procurement posts to `procurement-transactions/` (api-spec.md §3/§4) — same per-line endpoints as before, unchanged. The SKU select only offers lines with a planned quantity for the chosen source.

**Party / Team** — an AntD `Select` in `mode="tags"` capped to one value (`maxCount={1}`): free text, autocomplete-suggested from the existing Vendor list (`/vendors/`, §2.5) but not validated against it — a transaction can be logged against a name with no Vendor master record. Required on every new transaction (business-rules.md §4/§5), replacing the earlier design's dedicated Vendor-only field.

### 5.4 Procurement

**Built**, presented jointly with Production inside **Fulfilment** as of Phase 1 (§5.3) — the standalone `ExportOrderProcurementTab.tsx` was replaced by `ExportOrderFulfilmentTab.tsx`. Choosing **Procurement** as the modal's Source shows the same field set as Production (§5.3) — Party/Team, not a dedicated Vendor select; `vendor` on `ProcurementTransaction` is now optional (domain-model.md §3.5, business-rules.md §5) and no longer surfaced in this modal at all, kept only for older rows and reporting.

### 5.5 Packing Materials

**Built** (`ExportOrderPackingMaterialsTab.tsx`, one component reused across 4 tabs — Cartons, Pouches, Retail Stickers, Box Labels) — deliberately **not** a full Procurement module: no vendor ledger, no transaction log, V1 allows direct manual updates (business-rules.md §6).

Each tab opens with a glance-able `Statistic` row — **Total Required, Total Available, Total Shortage, SKUs Short** — computed client-side from the fetched rows, so a coordinator can see at a glance whether the order is covered before reading the table. Summary table: SKU, Required, Available Stock, Shortage (bold/red when `> 0`), **To Procure** (bold/red when `> 0`, "(manual)" suffix when overridden — business-rules.md §6), Ordered, Expected Arrival, Received, Accepted, Responsible, Status (`SkuPlanningStatusTag`, same shared enum as SKU Planning/Production/Procurement). Only lines eligible for that material appear — a Piece-unit line with no packing configuration never shows up in any of the 4 tabs; a line whose Customer SKU Mapping has `has_retail_sticker = No` never shows up in Retail Stickers.

Row click opens a `Drawer` to edit Available Stock, **To Procure** (help text shows the computed Shortage alongside it, so raising it — e.g. to buffer for expected packing damage — is a visible deliberate choice, not a silent override), Ordered, Expected Arrival, Received, Accepted, Responsible Person, Status, Remarks. The **Required** field is read-only everywhere except **Box Labels**, where it's the one manually-entered number (no formula exists for it) — every other material's Required is server-computed and cannot be edited here.

### 5.6 Packing

**Rebuilt** (`ExportOrderPackingTab.tsx`, screenshot-driven, replacing the earlier expandable-row design described below) — the order-scoped Packing readiness view. Distinct from §5.5 Packing Materials: this is about *packing progress* (how much has been packed), not *packing material supply* (whether there's enough cartons/pouches/stickers/labels to pack with). Two stacked `SectionCard`s, matching the Fulfilment tab's layout (§5.3):

- **SKU Packing Readiness table** — one row per line from `/packing-monitor/` (api-spec.md §5), pieces-denominated: SKU (code + product name), **Packable Qty** (the order's required piece quantity — `required_pieces`, business-rules.md §2 — **not** bounded by Fulfilment's cumulative Accepted Qty; a deliberate, confirmed decision, see business-rules.md §6), **Packed Qty** (`packed_pieces` — both entry types combined), **Balance**, **Last Update** (`last_transaction_at`), a `Progress` bar, a **Status** tag, and a per-row **Add Transaction** action. A SKU-filter `Select` and an **Add Manual Transaction** button sit in the card header (moved here from a standalone "Log Packing" button, matching the Fulfilment tab's header layout).
- **Status** tag — reuses `FulfilmentStatusTag`/`FulfilmentReadinessStatus` verbatim from the Fulfilment tab (business-rules.md §8), overridden to **Complete** once Packed Qty ≥ Packable Qty for that SKU.
- **Recent Packing Transactions table** — a second `SectionCard` below: the order-wide, paginated transaction log (api-spec.md §5.1), independently filterable by SKU and paginated with a page-size selector (10/20/50, default 10) plus a quick-jumper — unlike the Fulfilment tab's fixed-size log. Columns: Date, SKU, Pouches, Cartons, Pieces, Packed By, Remarks — no separate source column (only one source here, unlike Fulfilment's Production/Procurement split) and no separate audit "Recorded By" column (Packed By already answers "who").

The **"Add Packing Transaction"** modal (`AddPackingTransactionModal.tsx`, replacing the old "Log Packing" modal below) opens from either the header's **Add Manual Transaction** button (SKU field open, required) or a readiness row's **Add Transaction** action (SKU field **pre-selected and locked**) — same reused-in-two-contexts pattern as the Fulfilment tab's modal. Fields: SKU, Packing Date (a plain `DatePicker`, not the mockup's "Date & Time" — same reasoning as the Fulfilment tab's date-only field, ui-spec.md §5.3: the backend `date` field has no time component), **Pouches Packed** and **Cartons Packed** as two separate `InputNumber` fields shown together (not the old two-option `Segmented`) — client-validated that **exactly one** of the two is filled (a cross-field AntD validator, `dependencies`), since the backend still enforces the same mutual-exclusivity rule it always has (business-rules.md §6, a confirmed, deliberately-kept rule — the mockup's simultaneous layout is presentation only). A read-only **Pieces Packed** field always shows a static "0" with a caption ("Auto-calculated from pouches and cartons configuration.") — no client-side calculation of the real value, consistent with CLAUDE.md's "React must not independently implement business calculations"; the true `calculated_pieces` only ever comes from the backend response after save, same restraint as the Planning v2 tab's live-preview rule. **Packed By** (`Select`, `/employees/` — same picker component already used for Responsible Person elsewhere) and **Shift / Team** (`Select mode="tags"` capped to one value, optional, suggested from `/teams/`) — both new fields (business-rules.md §6, domain-model.md §3.7). Remarks has a 250-character counter (`showCount maxLength={250}`), matching the mockup — the Fulfilment modal's Remarks field has no such limit.

**Earlier design (superseded by the rebuild above, kept for history):** an expandable-row summary table (SKU, Required Cartons, Packed Cartons, Balance, Extra Pouches, Progress %) with a single "Log Packing" button opening a `Segmented`-driven modal (Cartons Completed / Pouches Packed as one exclusive choice, not two simultaneous fields) — deliberately not the Production/Procurement dense inline-entry-row pattern, since this screen targets factory-floor use. On save: a success toast plus immediate table refresh; on a rejected save, the server's message appears inline in the modal (`Alert`, not a toast) and the modal stays open with nothing lost — this save/error behavior is unchanged by the rebuild.

### 5.7 Shipments (shipment planning, now under the Shipping tab)

**Built** (`ExportOrderShippingTab.tsx`, embedded on the `shipping` top-level tab as of Phase 1 — previously a standalone `Shipments` tab via `ExportOrderShipmentsTab.tsx`) — shipment *planning* for this order: a table of the order's Shipments (Shipment Number, Planned Container Type, Planned Ready Date, Planned Stuffing Date, Container Number — "—" when not yet assigned, Status). A **"New Shipment"** button opens a small `Modal` with just the planning fields (`shipment_number`/`status` are server-set). Row click opens a `Drawer` to edit the shipment (including assigning `container_number` once known) and, below, a **Shipment Lines** section — a small table (SKU, Planned Qty, Planned Cartons) with an inline add-line form (SKU select + quantity), letting one Export Order SKU be split across multiple Shipments. An over-allocation attempt (splitting more than was ordered) surfaces the server's error inline next to the add-line form without losing what was entered.

Loading entry (§8 Loading Screen, scoped to a shipment) is built. The fuller logistics/shipping-information fields, document tracker, and progress stepper (§9) are **not built** — deferred to a later phase, so today the Shipping tab shows only this planning table, not the fuller screen sketched in §9.

### 5.10 Documents

List of `ShipmentDocument` rows across the order's shipments, with type, status, and a `Customer Visible` toggle.

### 5.11 Activity/History

Combined, chronological feed of: field-history changes (audit trail), `DateRevision` entries, and the `comments` discussion thread on this order. One feed, not three separate lists.

## 6. Packing Monitor

**Built as the order-scoped embedding** (§5.6, `ExportOrderPackingTab.tsx`) — one of the key daily operational screens. The standalone cross-order screen (keyed by Shipment, with a header showing Shipment/Customer/Planned Stuffing/Packing Window) stays **not built**, since Shipment doesn't exist yet; when it does, this becomes an additive screen reusing the same summary shape, not a rewrite.

SKU table: **SKU, Required Cartons, Packed Cartons, Balance, Extra Pouches, Progress %** — built exactly as specified.

Daily packing history is built as a **per-SKU expandable log** inside the summary table (row expand, same pattern as the Production/Procurement tabs), not a separate unified cross-SKU log table — confirmed as the intended shape over the alternative (a standalone "Daily Packing log" section spanning every SKU). "Plan vs Actual" (cumulative planned vs actual cartons by day) is **not built** — there's no daily packing *plan* to compare against yet, only the running actuals.

## 7. Role permission matrix

| Capability | Export Coordinator | Production Coord. | Procurement Coord. | Packing Coord. | Logistics Coord. | Manager/Admin |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Create/edit Export Order, PO lines, SKU planning | ✅ | – | – | – | – | ✅ |
| Cancel Order, Advance to Next Stage | ✅ | – | – | – | – | ✅ |
| Add a Note | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create Shipments, upload documents | ✅ | – | – | – | ✅ | ✅ |
| Enter Loading details | ✅ | – | – | – | ✅ | ✅ |
| View all phases of an order | ✅ | – | – | – | – | ✅ |
| View assigned Production Requirements, enter Production Transactions | ✅ (fallback) | ✅ | – | – | – | ✅ |
| View Procurement Requirements, record receipts, manage vendor/dates | ✅ (fallback) | – | ✅ | – | – | ✅ |
| View and update Packing Material Requirements (Cartons, Pouches, Retail Stickers, Box Labels) | ✅ | – | – | ✅ | – | ✅ |
| Enter daily Packing Transactions | ✅ | – | – | ✅ | – | ✅ |
| Manage Shipment/Container/Shipping info, logistics references, documents | ✅ (fallback) | – | – | – | ✅ | ✅ |
| Manage masters, users, view all data | – | – | – | – | – | ✅ |

"✅ (fallback)" reflects spec §43: the Export Coordinator can manually enter any operational update in V1 because the owning modules (Production/Procurement) don't exist as separate systems yet. Every entry still records `entered_by` regardless of who makes it, so this fallback never loses accountability. Packing (like Packing Materials) never used this fallback pattern — `CanManagePacking` grants the Export Coordinator plain, intended write access from the start, the same as the Packing Coordinator. No role-management UI in V1 — roles are Django Groups, assigned via Django admin.

## 8. Loading Screen

**Rebuilt** (`ExportOrderLoadingTab.tsx`, screenshot-driven, replacing the earlier design described below, embedded on the `loading` tab — no standalone screen yet) — optimized for container stuffing day. Loading is inherently scoped to one Shipment at a time — preserved from the earlier design even though the mockup's crop doesn't show it — so the tab still opens with a `Select` of the order's Shipments (defaulting to the first, now shown in the readiness card's header, not above the table); an order with no Shipments yet shows a "create a shipment first" `Empty` state pointing at the Shipping tab instead of the table.

**Header, changed for this tab only**: while `activeTab === 'loading'`, the page header's primary action switches from **Edit Order** to **Mark as Loaded** (calls the same `advance` action as the header kebab's "Advance to Next Stage," business-rules.md §8 — disabled unless the order's current stage is `LOADING`) plus **Export Loading Sheet** (placeholder, `message.info`, same treatment as the Fulfilment/Packing tabs' "View History" placeholders). Every other tab keeps the plain Edit Order button.

**SKU Loading Readiness table** — pieces-denominated (relabeled from cartons, same "Packing tab" precedent — a deliberate call, not the mockup's literal "Packed qty drives loadable qty" subtitle: Loadable Qty stays the shipment's own planned allocation, *not* newly bounded by Packing's cumulative, matching the Packing tab's own near-identical subtitle decision). Columns: SKU, **Required Qty (Boxes)** (new — `ExportOrderLine.required_cartons`, the order-wide total, in cartons — the one column that stays box-denominated, per its own label), Loadable Qty (`planned_qty`, pieces — this shipment's own planned allocation), Loaded Qty (`actual_loaded_qty`, pieces, both entry types combined), Balance (`planned_qty − actual_loaded_qty`, a plain per-row subtraction, not a business calculation), **Last Update** (new — `last_loading_transaction_at`), a `Progress` bar, a **Status** tag (reuses `FulfilmentStatusTag` verbatim — a third reuse alongside Fulfilment/Packing — replacing the earlier Pending/Exact/Short Loaded/Excess Loaded tag vocabulary in this table; Complete once Loaded Qty ≥ Loadable Qty), and a per-row **Update Loading** action (label kept from the earlier design even though it now opens the ledger's entry modal, not an overwrite).

**Loading Transactions — new, collapsed by default** (AntD `Collapse`, matches the request literally: "I want it to be collapsed") — the order-wide-per-shipment, paginated activity feed (api-spec.md §6, domain-model.md §3.8.1), same shape as Fulfilment's/Packing's "Recent Transactions" tables but scoped to the selected Shipment only. Independently filterable by SKU. Columns: Date, SKU, Cartons, Pouches, Pieces, Reason, Remarks — no separate "Recorded By" column (this table skews toward "what happened," not "who did it," matching the mockup's stated purpose "just to say what is getting loaded").

**"Update Loading" modal** (`AddLoadingTransactionModal.tsx`, replacing the earlier design's overwrite-based modal — no mockup was provided for this specific dialog, designed to match the established Fulfilment/Packing modal pattern): opens per-row, title still shows the SKU (no SKU picker needed — the row context locks it, like the earlier design). Fields: read-only Loadable Qty (Cartons), Loading Date, **Cartons Loaded Now** and **Pouches Loaded Now** as two separate fields (mutually exclusive per entry, client-validated — mirrors the Packing tab's Pouches/Cartons pair exactly, since `LoadingTransaction` mirrors `PackingTransaction`'s shape), a static **Pieces Loaded (Auto)** placeholder ("0" + caption, no client-side calculation — same restraint as the Packing tab's Pieces Packed field, per CLAUDE.md's "React must not independently implement business calculations"), **Net Weight**/**Gross Weight** (auto, read-only, showing the shipment line's last-known server-computed cumulative value with a "Recalculates after you save" caption — unchanged from the earlier design, since displaying already-fetched server data isn't a new calculation), and **Reason** — always visible and optional in the UI (no client-side replication of the cumulative-variance rule); the backend rejects the save with a clear inline error if a reason turns out to be required, rather than the earlier design's client-computed conditional-required field. Remarks is optional.

**Container Loading Details / Loading Summary / Loading Checklist** — three cards below the collapsed feed, matching the mockup's three-column block:
- **Container Loading Details** — deferred to a placeholder for this pass: shows only what already exists (`Shipment.container_number`, `planned_stuffing_date`) plus a note that Vehicle No., Seal No., an actual Stuffing Date, Loading Date, and VGM aren't available yet. These overlap heavily with fields already earmarked for the later full Shipping-buildout phase (domain-model.md §3.8's deferred-fields list) — not added now.
- **Loading Summary** — real, computed client-side from the currently-loaded readiness rows (plain sums of already-server-provided per-line figures, not a new calculation): Total Cartons Loaded, Total Pouches Loaded, Total Net Weight, Total Gross Weight.
- **Loading Checklist** — **static display only for this pass**, explicitly flagged in the code as decorative (fixed "Completed" tags on Container inspected / Pallets arranged / Cartons loaded / VGM completed / Seal applied) — no backend model, no persistence, no checked-by/checked-at tracking. A real implementation (a new model, toggleable, tracked) is planned for a later pass.

**Earlier design (superseded by the rebuild above, kept for history):** an always-editable inline table, then (Phase 1) a cartons-denominated "SKU Loading Readiness" table (Loadable Qty = `planned_cartons`, Balance = the SKU's order-wide outstanding amount across every Shipment) with a per-row "Update Loading" modal that directly overwrote `ShipmentLine.actual_loaded_cartons`/`variance_reason` (a single mutable field pair, not a ledger) — Reason appeared/became required only once the entered quantity differed from Loadable Qty, blocking Save until picked.

## 9. Shipment Screen

Header: Shipment Number, Customer, Export Order, Container, Current Status.

Sections: Container, Shipping Information, Dates, Loaded SKU Summary, Documents, Shipment Value, Customer Information.

## 10. Customer Portal

Separate, restricted surface — same design language, far less data.

- **Open Orders**, **Past Orders** lists.
- Per order/shipment: PO Number, Order status, Packing Progress, Planned Ready Date, Container Number, ETD, ETA, Shipping Line, documents flagged `customer_visible=true`, `customer_remarks`.
- Never shown: vendor/supplier details, internal production or procurement remarks, staff comments, risk discussion, cost data, internal responsibility fields, internal remarks.
- Portal accounts are a distinct login path scoped to one Customer (see domain-model.md open question #12 on the underlying `CustomerUser` model) — not an internal staff account with reduced permissions. This keeps the customer-facing surface simple to reason about: it's a separate, narrow read surface, not the internal app with fields hidden.

## 11. Shared components (frontend)

Build once in `frontend/src/shared/components/`, reused across every screen above and by future modules:

- `StatusTag` / `RiskTag` — consistent color coding for Planning Status, Risk Status, Loading Status, Document Status.
- `ProgressStepper` (**built**, Phase 1) — a compact colored-dot stepper for order-level status (Export Orders list, replacing a plain status `Tag`); generic over any ordered step list, not Export-Order-specific (`ExportOrderProgressStepper.tsx` supplies the Export Order status mapping).
- `SectionCard` (**built**, Phase 1) — a thin `Card` wrapper giving every screen-level section consistent radius/shadow/padding, used across the redesigned Export Orders screens.
- `ProgressBar` with a "drill-down" affordance (click to reveal gross vs accepted breakdown).
- `ReconciliationTable` — the Ordered → Stock Used → Production Accepted → Procurement Accepted → Packed → Loaded → Shipped → Balance table (functional spec §41), reused on Overview and SKU detail.
- `AttachmentList` / `AttachmentUpload` — thin wrapper over the generic `attachments` API.
- `CommentThread` — thin wrapper over the generic `comments` API, used in Activity/History.
- `VarianceReasonPrompt` — the required-reason-on-variance pattern (Loading, and any future variance capture).
