# Export Order Management — API Spec (V1)

REST, DRF, path-versioned under `/api/v1/`, per the platform architecture proposal. This is an implementation-oriented resource map, not a full OpenAPI document — field-level detail lives in [domain-model.md](domain-model.md) and calculation/validation behavior in [business-rules.md](business-rules.md); this doc says which endpoint triggers which of those.

## Conventions

- Auth: session + CSRF, same-origin (see architecture proposal). Customer portal uses a separate authenticated realm (§7).
- Pagination: DRF `PageNumberPagination` on all list endpoints.
- Errors: DRF default `{"field": ["message"]}` shape; business-rule violations (e.g. missing variance reason) return `400` with the field they attach to, not a generic error string, so the frontend can surface it inline.
- Generic capabilities (`attachments`, `comments`) are mounted as nested routes via the reusable viewset mixins from those apps — one line of router config per parent resource, no bespoke endpoints.
- Read-heavy aggregate endpoints (reconciliation, dashboard) are plain `GET`s backed by `export_orders.selectors` functions — never computed client-side.

## 1. Export Order

| Method | Path | Notes |
|---|---|---|
| GET | `/export-orders/` | Filters: `customer`, `coordinator`, `status`, `planned_ready_date`, `country`, `risk`, `shipment_status`. Powers the list screen (ui-spec.md §4). |
| POST | `/export-orders/` | Creates order + first `ExportOrderPOVersion` in one call (PO document required). |
| GET | `/export-orders/{id}/` | |
| PATCH | `/export-orders/{id}/` | Header field updates. A `planned_ready_date` change requires a `reason` field in the payload and creates a `DateRevision` row (business-rules.md §11) — the endpoint rejects a bare date change without one. |
| GET | `/export-orders/{id}/overview/` | Computed: phase progress %, SKU summary, packing summary, shipment summary, outstanding actions (ui-spec.md §5.1). |
| GET | `/export-orders/{id}/reconciliation/` | Computed: Ordered → Stock Used → Production Accepted → Procurement Accepted → Packed → Loaded → Shipped → Balance per line (business-rules.md §1, spec §41). |
| GET/POST | `/export-orders/{id}/attachments/` | Generic mixin. |
| GET/POST | `/export-orders/{id}/comments/` | Generic mixin — Activity/History feed. |
| GET | `/export-orders/{id}/date-revisions/?field=planned_ready_date` | |

### PO Versions

| Method | Path | Notes |
|---|---|---|
| GET | `/export-orders/{id}/po-versions/` | Ordered newest-first, `is_current` flagged. |
| POST | `/export-orders/{id}/po-versions/` | Uploads a new version, becomes current automatically (V1 has no separate "accept" step — flagged as an assumption, see domain-model.md §6 #7). Previous versions are never deleted. |

### Status, notes — Built (not in the sketch above)

| Method | Path | Notes |
|---|---|---|
| POST | `/export-orders/{id}/cancel/` | Sets `status = CANCELLED`. `400` if already cancelled. `CanManageExportOrders`. |
| POST | `/export-orders/{id}/advance/` | Moves `status` to the next value in `ExportOrder.STAGE_SEQUENCE` and logs an `ExportOrderStageEvent` (domain-model.md §3.1, business-rules.md §8). `400` if already `COMPLETE`, or if `CANCELLED` (not in the sequence). `CanManageExportOrders`. |
| GET/POST | `/export-orders/{id}/notes/` | `ExportOrderNote`, list/create only. `IsInternalStaff` for both — broader than most write actions here, since adding a note is collaborative. |

`GET /export-orders/{id}/` (detail) additionally returns `container_type` (also on the list serializer) and `stage_history` (detail only) — both computed, read-only, documented in domain-model.md §3.1.

### Lines

**Built** (`backend/apps/export_orders/views.py` — `ExportOrderLineViewSet`), header + conversion fields only — see domain-model.md §3.1 for the full deviation list from this section's original sketch.

| Method | Path | Notes |
|---|---|---|
| GET | `/export-orders/{id}/lines/` | **Not paginated** — deliberate deviation from this doc's "PageNumberPagination on all list endpoints" convention (see Conventions above). The global `PAGE_SIZE` (20) would silently truncate a 30-50 line order and fight the spreadsheet-like rapid-entry UI, which needs the full set in one response. |
| POST | `/export-orders/{id}/lines/` | `customer_sku_code` + `original_customer_quantity` + `original_customer_unit` required; `customer_description`/`product` optional. `product` (internal SKU) is only required when `original_customer_unit` is `POUCH`/`CARTON` — resolved against `CustomerSKUMapping` for `(order.customer, product)` and rejected with `400` on `product` if unresolvable or missing the needed packing field(s). `PIECE`-unit lines never need `product` or a mapping. |
| GET | `/export-orders/{id}/lines/{line_id}/` | |
| PATCH | `/export-orders/{id}/lines/{line_id}/` | Changing `product` re-resolves and re-snapshots `pieces_per_pouch`/`pouches_per_carton` from the mapping; any other field change leaves the existing snapshot untouched. |
| DELETE | `/export-orders/{id}/lines/{line_id}/` | Not in this doc's original sketch — added so a coordinator can correct a mis-entered line, same as `products.CustomerSKUMappingViewSet`'s delete route. |

### Supply Planning

**Built** (`backend/apps/export_orders/views.py` — `SKUSupplyPlanView`, `SKUSupplyPlanListView`) — see domain-model.md §3.3 for the full deviation list.

| Method | Path | Notes |
|---|---|---|
| GET | `/export-orders/{id}/lines/{line_id}/supply-plan/` | 1:1 `SKUSupplyPlan`. Always returns a shape — a *virtual* default (all quantities 0, dates null, `NOT_STARTED`) when no row has been saved yet, never a `404`. |
| PATCH | `/export-orders/{id}/lines/{line_id}/supply-plan/` | Upserts (creates the row on first save). Runs the Planning Balance validation (business-rules.md §3) before persisting anything — a rejected `PATCH` leaves no row behind if none existed. |
| GET | `/export-orders/{id}/supply-plans/` | **Not in this doc's original sketch** — added because the singleton route alone would force one `GET` per line to populate the SKU Planning table (same "give the whole set in one call" reasoning as the unpaginated Lines endpoint above). **Not paginated**, one row per line (mixed real/virtual), includes line-identity fields (`customer_sku_code`, `product_sku_code`, `product_name`). |

## 2. Customer↔SKU bridge — built, in `products`, not `export_orders`

Owned by the reusable `products` app (`backend/apps/products/urls.py`), not this module — listed here only because Export Order Lines will consume it. One resource, not two: SKU mapping and packing configuration are the same row (domain-model.md §3.2).

| Method | Path | Notes |
|---|---|---|
| GET/POST | `/customer-sku-mappings/?customer=&search=` | Packing fields (`pieces_per_pouch`/`pouches_per_carton`/computed `pieces_per_carton`, Carton Configuration, Pouch Configuration, Retail Sticker, Silica Gel, Other — see domain-model.md §3.2) are on the same object, plus a nested read-only `files` list. |
| GET/PATCH/DELETE | `/customer-sku-mappings/{id}/` | |
| GET/POST | `/customer-sku-mappings/{id}/files/?category=` | `CustomerSKUMappingFile` — multipart upload, `category` + `file`. Server rejects: files over 5MB, non-image/PDF content types, and uploads past the per-category cap (10 for `PLATE_IMAGE`/`POUCH_IMAGE`/`DESIGN_FILE`, 3 for `RETAIL_STICKER_IMAGE`) — all `400`. |
| DELETE | `/customer-sku-mappings/{id}/files/{file_id}/` | No update route — replacing a file is delete-then-reupload. |

Editing a `CustomerSKUMapping` row never touches already-created `ExportOrderLine` rows — those keep the values they were created with, copied at line-creation time, not referenced live (domain-model.md §3.2).

## 3. Production

**Built** (`backend/apps/export_orders/views.py` — `ProductionRequirementListView`, `ProductionTransactionViewSet`), nested under one order/line at a time — a deliberate scope-narrowing from this section's original flat/cross-order sketch below, not a drop: that sketch predates `SKUSupplyPlan` and assumed a standalone Production module surface. A future cross-order "Production Coordinator's daily queue" dashboard is out of scope for this slice (per CLAUDE.md — "not a full Production ERP module") and would be new, additive endpoints, not a rewrite of these.

**Unchanged endpoint shape from the Phase 1 UI redesign** — the frontend's Fulfilment tab (ui-spec.md §5.3) presents this section jointly with Procurement (§4) in one combined table/modal, but calls these same per-line endpoints; there is no combined backend write endpoint (there is now a combined **read** endpoint, §4.1 below). The rebuilt Fulfilment tab did add a real field to the request/response bodies here — `party_team` (see row below).

| Method | Path | Notes |
|---|---|---|
| GET | `/export-orders/{id}/production-requirements/` | Summary across every line with a planned production quantity (`SKUSupplyPlan.quantity_to_produce > 0`) — one row per line, real or a *virtual* default (zero accepted/produced/rejected, `NOT_STARTED`) if no `ProductionRequirement` has been created yet. Never a per-line `404`, same pattern as `.../supply-plans/`. Now also returns `last_transaction_at` (`Max(transactions.created_at)`, `null` if none). |
| GET/POST | `/export-orders/{id}/lines/{line_id}/production-transactions/` | `POST` body includes `party_team` (required, free text) alongside `date`, `quantity_produced`, `quantity_accepted`, `quantity_rejected`, `remarks`. Auto-creates the `ProductionRequirement` on first save (`get_or_create`) — `400` if the line has no planned production quantity, if `party_team` is missing, or if `quantity_accepted + quantity_rejected` exceeds `quantity_produced`. |
| PATCH | `/export-orders/{id}/lines/{line_id}/production-transactions/{id}/` | Correction path — no delete route; a mistaken entry is edited in place (business-rules.md §11). |

Original flat/cross-order sketch (not built — see above):

| Method | Path | Notes |
|---|---|---|
| GET/POST | `/production-requirements/?export_order=&line=&status=` | |
| PATCH | `/production-requirements/{id}/` | |
| GET | `/production-requirements/{id}/transactions/` | |
| POST | `/production-transactions/` | Body includes `production_requirement`, `quantity_produced`, `quantity_accepted`, `quantity_rejected`. On save: recomputes the parent requirement's cumulative accepted total and flips its status to `READY` if the threshold is met (business-rules.md §4). |
| GET | `/production-transactions/?requirement=&export_order=&date_from=&date_to=` | Top-level, for dashboard/report queries across requirements. |
| PATCH | `/production-transactions/{id}/` | Correction path — history captures old/new `quantity_accepted` (business-rules.md §11). |

## 4. Procurement

**Built** (`backend/apps/export_orders/views.py` — `ProcurementRequirementListView`, `ProcurementTransactionViewSet`), nested under one order/line at a time — same scope-narrowing as Production (§3), for the same reason. Vendor is captured per transaction (each receipt lot), not per requirement — see domain-model.md §3.5 for why.

**Unchanged endpoint shape from the Phase 1 UI redesign** — see the note in §3; same `party_team` addition applies here, plus `vendor` flipping from required to optional.

| Method | Path | Notes |
|---|---|---|
| GET | `/export-orders/{id}/procurement-requirements/` | Summary across every line with a planned procurement quantity (`SKUSupplyPlan.quantity_to_procure > 0`) — one row per line, real or a *virtual* default until the first receipt. Never a per-line `404`, same pattern as `.../production-requirements/`. Now also returns `last_transaction_at`, same shape as Production's. |
| GET/POST | `/export-orders/{id}/lines/{line_id}/procurement-transactions/` | `POST` body includes `party_team` (required, free text), `vendor` (now optional — nullable FK), `date`, `quantity_received`, `quantity_accepted`, `quantity_rejected`, `remarks`. Auto-creates the `ProcurementRequirement` on first save (`get_or_create`) — `400` if the line has no planned procurement quantity, if `party_team` is missing, or if `quantity_accepted + quantity_rejected` exceeds `quantity_received`. `vendor` missing is **no longer** a `400` — reversed from the original rule. |
| PATCH | `/export-orders/{id}/lines/{line_id}/procurement-transactions/{id}/` | Correction path — no delete route; a mistaken entry is edited in place (business-rules.md §11). |

Original flat/cross-order sketch (not built — see above):

| Method | Path | Notes |
|---|---|---|
| GET/POST | `/procurement-requirements/?export_order=&line=&vendor=&status=` | |
| PATCH | `/procurement-requirements/{id}/` | |
| POST | `/procurement-receipts/` | Header + inline `lines: [...]` array (one vendor delivery, multiple SKUs) — created atomically. Each line's `quantity_accepted` rolls up into its `procurement_requirement`'s cumulative total and status, same pattern as Production. |
| GET | `/procurement-receipts/?vendor=&export_order=&date_from=&date_to=` | |
| GET | `/procurement-receipt-lines/?requirement=&export_order=` | Top-level, for dashboards/reports. |
| PATCH | `/procurement-receipt-lines/{id}/` | Correction path, same as Production. |

### 4.1 Fulfilment transaction log (order-wide) — Built

`GET /export-orders/{id}/fulfilment-transactions/?line=<id>&page=<n>` (`FulfilmentTransactionListView`) — the Fulfilment tab's "Recent Fulfilment Transactions" table (ui-spec.md §5.3). Read-only; merges every `ProductionTransaction` and `ProcurementTransaction` across the order's lines into one newest-first, paginated list (`PageNumberPagination`, `PAGE_SIZE=20`). `line` is optional (all lines if omitted). Response shape:

```json
{
  "count": 42,
  "next": "https://.../fulfilment-transactions/?page=2",
  "previous": null,
  "results": [
    {
      "id": "production-17",
      "date": "2026-08-12",
      "source": "PRODUCTION",
      "export_order_line": 5,
      "customer_sku_code": "CUST-SKU-1",
      "product_name": "Areca Plate",
      "party_team": "Production Team A",
      "quantity": 400,
      "quantity_accepted": 400,
      "quantity_rejected": 0,
      "remarks": "",
      "entered_by": "coord1",
      "created_at": "2026-08-12T09:15:00Z"
    }
  ]
}
```

`id` is `"production-{pk}"` / `"procurement-{pk}"` (not a real model PK — no single model backs this row). `quantity` is `quantity_produced` or `quantity_received` depending on `source`. Creating a transaction still goes through the per-line endpoints in §3/§4 — there is no `POST` here.

## 5. Packing materials & packing

### Packing materials — Built

**Built** (`backend/apps/export_orders/views.py` — `PackingMaterialRequirementListView`, `PackingMaterialRequirementView`), nested under one order/line at a time, same "virtual until first write" pattern as Supply Planning (§1). Deliberately not a Requirement+Transaction ledger like Production/Procurement (business-rules.md §6) — `CanManagePacking` write access (Export Coordinator, Packing Coordinator, Manager/Admin).

| Method | Path | Notes |
|---|---|---|
| GET | `/export-orders/{id}/packing-material-requirements/?material_type=CARTON\|POUCH\|RETAIL_STICKER\|BOX_LABEL` | Required, `material_type` query param. Summary across every line eligible for that material — one row per line, real or a *virtual* default (zero stock/ordered, `NOT_STARTED`) if no row has been saved yet. A line is eligible for `CARTON`/`BOX_LABEL` when `required_cartons` is not null, `POUCH` when `required_pouches` is not null, `RETAIL_STICKER` when the line's snapshotted `has_retail_sticker` is true. |
| GET/PATCH | `/export-orders/{id}/lines/{line_id}/packing-material-requirements/{material_type}/` | Singleton per (line, material_type). `404` if the line isn't eligible for that material or `material_type` isn't one of the 4 values. `PATCH` persists the virtual row on first write. `manual_required_qty` is writable only when `material_type=BOX_LABEL` — `400` otherwise (every other material's `required_qty` is server-computed, read-only). `manual_to_procure_qty` (Phase: Planning, formerly "Planning v2") is writable for every material type — overrides the read-only computed `to_procure_qty` (defaults to `shortage`); no `400`, no clamping either direction (business-rules.md §6). |

### Packing (transactions & monitor) — Built

**Built** (`backend/apps/export_orders/views.py` — `PackingMonitorView`, `PackingTransactionViewSet`), nested under one order/line at a time, same scope-narrowing as Production/Procurement/Packing Materials — no `shipment` query param (Shipment isn't built yet). No "virtual until first write" synthesis needed: `required_cartons` and the cumulative sums are always-live computed properties on `ExportOrderLine`, so every eligible line already has a real row. `CanManagePacking` write access (Export Coordinator, Packing Coordinator, Manager/Admin), same role as Packing Materials.

| Method | Path | Notes |
|---|---|---|
| GET | `/export-orders/{id}/packing-monitor/` | Packing Monitor summary: one row per cartonized line (`required_cartons is not None`) — `required_cartons`, `packed_cartons`, `extra_pouches`, `balance`, `progress`, plus pieces-denominated equivalents added for the Packing tab rebuild: `packable_qty` (source `required_pieces`), `packed_pieces`, `balance_pieces`, `progress_pieces`, `last_transaction_at`. |
| GET/POST | `/export-orders/{id}/lines/{line_id}/packing-transactions/` | `POST` accepts `date` + `entry_type` (`CARTON_COMPLETED`/`POUCH_PACKED`) + exactly one of `cartons_packed`/`pouches_packed` matching the entry type (`400` otherwise) + `packed_by` (required — FK to `accounts.Employee`) + `shift_team` (optional free text); `calculated_pieces` is server-computed, never accepted from the client (business-rules.md §6). `400` if the line has no carton configuration or if `packed_by` is missing. |
| PATCH | `/export-orders/{id}/lines/{line_id}/packing-transactions/{id}/` | Correction path — no delete route; a mistaken entry is edited in place (business-rules.md §11). |

### 5.1 Packing transaction log (order-wide) — Built

`GET /export-orders/{id}/packing-transactions/?line=<id>&page=<n>&page_size=<n>` (`PackingTransactionLogListView`) — the Packing tab's "Recent Packing Transactions" table (ui-spec.md §5.6). Read-only, paginated (default `PAGE_SIZE=20`, but unlike Fulfilment's log, the client can override via `?page_size=`, up to 100 — the mockup shows a page-size selector). `line` is optional (all lines if omitted). Response shape:

```json
{
  "count": 7,
  "next": null,
  "previous": null,
  "results": [
    {
      "id": 42,
      "date": "2026-08-12",
      "export_order_line": 5,
      "customer_sku_code": "CUST-SKU-1",
      "product_name": "Areca Plate",
      "entry_type": "CARTON_COMPLETED",
      "cartons_packed": 20,
      "pouches_packed": null,
      "calculated_pieces": 4000,
      "packed_by_detail": { "id": 3, "employee_code": "EMP-1", "full_name": "Ravi K", "team": null },
      "shift_team": "Morning Shift",
      "remarks": "",
      "entered_by": "coord1",
      "created_at": "2026-08-12T09:30:00Z"
    }
  ]
}
```

Simpler than Fulfilment's equivalent (api-spec.md §4.1): only one source model here, so this is a real paginated queryset, not a merged list of dicts. Creating a transaction still goes through the per-line endpoint above — there is no `POST` here.

Original flat/shipment-keyed sketch (not built — see above):

| Method | Path | Notes |
|---|---|---|
| GET/POST | `/packing-transactions/?export_order_line=&shipment=` | |
| GET | `/packing-monitor/{shipment_id}/` | Computed view backing the standalone Packing Monitor screen: per-SKU required/packed/balance/extra-pouches/progress, plus daily packing log and plan-vs-actual — deferred until Shipment exists. |

## 6. Shipment

### Shipment planning — Built

**Built** (`backend/apps/export_orders/views.py` — `ShipmentViewSet`, `ShipmentLineViewSet`), nested under the order (and, for lines, under the shipment) — deviates from this section's original flat `/shipments/{id}/` sketch to match every other resource in this app. Full CRUD on both (list/create/retrieve/update/delete), same reasoning as `ExportOrderLineViewSet` — a coordinator fixing a mis-created shipment or mis-split line deletes and re-enters it. `CanManageShipments` write access (Export Coordinator, Logistics Coordinator, Manager/Admin).

| Method | Path | Notes |
|---|---|---|
| GET/POST | `/export-orders/{id}/shipments/` | `POST` auto-generates `shipment_number` (business-rules.md §10); all planning fields optional at creation — `container_number` starts blank. |
| GET/PATCH/DELETE | `/export-orders/{id}/shipments/{shipment_id}/` | `PATCH` is how `container_number` (and everything else) gets assigned later. |
| GET/POST | `/export-orders/{id}/shipments/{shipment_id}/lines/` | `POST` validates the referenced `export_order_line` belongs to the same order as the shipment, and that its `planned_qty` doesn't push the SKU's cross-shipment total past `required_pieces` (business-rules.md §7) — `400` on either violation. |
| GET/PATCH/DELETE | `/export-orders/{id}/shipments/{shipment_id}/lines/{line_id}/` | Planning fields only now (`planned_qty`, `remarks`) — loading moved to a dedicated ledger endpoint below, reversing the "loading is just more fields on this row" deviation this section used to describe. `actual_loaded_cartons`/`loaded_pouches`/`actual_loaded_qty`/`difference_cartons`/`loading_status`/`last_loading_transaction_at`/`net_weight_kg`/`gross_weight_kg`/`required_cartons`/`packed_cartons`/`remaining_balance_cartons` are all still exposed here, all read-only. |

### Loading — Built

**Rebuilt as a real ledger** (`LoadingTransactionViewSet`, `LoadingTransactionLogListView`) — supersedes the earlier design described just above (a single mutable `actual_loaded_cartons`/`variance_reason` pair directly on `ShipmentLine`). Same shape as Production/Procurement/Packing's transaction endpoints.

| Method | Path | Notes |
|---|---|---|
| GET/POST | `/export-orders/{id}/shipments/{shipment_id}/lines/{line_id}/loading-transactions/` | `POST` accepts `date` + `entry_type` (`CARTON_LOADED`/`POUCH_LOADED`) + exactly one of `cartons_loaded`/`pouches_loaded` matching the entry type (`400` otherwise) + optional `variance_reason`/`remarks`. `variance_reason` is **never required** (business-rules.md §7 — an earlier "required whenever the cumulative total doesn't match planned" rule was dropped once loading was clarified as frequent real-time partial updates, not a single end-of-day snapshot). `calculated_pieces` is server-computed, never accepted from the client. Saving also triggers the packed-but-not-loaded return to `Product.available_qty` (domain-model.md §3.8's delta-based reconciliation), same as before. The rebuilt "Update Loading" modal always sends `entry_type: CARTON_LOADED` with today's date auto-filled (no manual date picker) — `POUCH_LOADED` and a caller-supplied `date` remain valid for direct API use, just not exercised by this UI. |
| PATCH | `/export-orders/{id}/shipments/{shipment_id}/lines/{line_id}/loading-transactions/{transaction_id}/` | Correction path — no delete route; a mistaken entry is edited in place (business-rules.md §11). |
| GET | `/export-orders/{id}/shipments/{shipment_id}/loading-transactions/?line=<id>&page=<n>&page_size=<n>` | Order-*wide-per-shipment*, paginated log across every SKU on this one Shipment (the Loading tab's collapsed "Loading Transactions" feed, ui-spec.md §8) — scoped to a single Shipment, unlike Fulfilment's/Packing's order-wide logs, since a SKU split across Shipments has separate loading progress per Shipment. Client-overridable page size via `?page_size=` (default `PAGE_SIZE=20`), same as Packing's log. Read-only; creating a transaction still goes through the per-line endpoint above. |

**Phase 1 addition** (unchanged by the ledger rebuild): `net_weight_kg`/`gross_weight_kg`, two read-only fields on `ShipmentLine` — `actual_loaded_cartons × products.CustomerSKUMapping.carton_net_weight_kg`/`carton_gross_weight_kg` (resolved by customer+product, same lookup `ExportOrderLineSerializer._resolve_mapping` uses), `null` until a mapping and a loaded quantity both exist. Purely a computed display convenience for the Loading modal (ui-spec.md §8) — not stored, not part of any business rule.

### Documents — not built yet

| Method | Path | Notes |
|---|---|---|
| GET/POST | `/shipments/{id}/documents/` | |
| PATCH | `/shipments/{id}/documents/{doc_id}/` | |

## 7. Dashboard

| Method | Path | Notes |
|---|---|---|
| GET | `/dashboard/` | Upcoming shipments, orders at risk, production status (accepted/planned only), procurement status (accepted/planned only), packing material shortages, packing progress, today's actions — one call backing the whole dashboard screen. |

## 8. Customer portal

Separate, narrower API surface — same backend, distinct auth and serializers so internal-only fields are never in the response payload to begin with (business-rules.md §13), not filtered after the fact.

| Method | Path | Notes |
|---|---|---|
| POST | `/portal/auth/login/` | Scoped to `CustomerUser` (domain-model.md open question #12). |
| GET | `/portal/orders/?status=` | Open/Past orders for the authenticated customer only. |
| GET | `/portal/orders/{id}/` | Whitelisted fields only — see ui-spec.md §10 for the exact list. |
| GET | `/portal/orders/{id}/documents/` | Only `customer_visible=true` documents. |

## 9. Reusable-app endpoints referenced by this module

Owned by their respective apps, listed here only because the Export Orders frontend consumes them directly:

`/customers/`, `/customers/{id}/addresses/`, `/products/?item_type=`, `/vendors/?search=` (**Built** — `apps.vendors.VendorViewSet`, read-only, `IsAuthenticated`, active-only, same pattern as `/teams/`), `/teams/`, `/users/?group=`, generic `.../attachments/` and `.../comments/` mixins on any of the above.
