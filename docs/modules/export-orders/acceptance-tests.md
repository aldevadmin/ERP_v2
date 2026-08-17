# Export Order Management — Acceptance Tests (V1)

Given/When/Then scenarios derived from `functional-spec.md` §59 (validations) and §69 (core scenario), organized to map onto [business-rules.md](business-rules.md) sections. These are the scenarios `pytest` service-layer and API tests should implement — per `CLAUDE.md`, important business-rule changes require tests, and tests must not be weakened to make code pass.

## 0. Master end-to-end scenario

**AT-0 — Core Export Order lifecycle** (functional-spec.md §69, verifies the golden rule end-to-end)

- Given a customer PO with 20 SKUs in mixed units (cartons/pouches/pieces)
- When the Export Coordinator creates the Export Order and maps each customer SKU to an internal SKU
- Then every line's required quantity is expressed correctly in pieces (business-rules.md §2)
- Given SKU A requires 50,000 pieces, planned as 10,000 from stock / 25,000 to produce / 15,000 to procure
- And Production reports Produced 26,000 / Accepted 24,000 / Rejected 2,000
- And Procurement reports (across two lots) Received 15,000 / Accepted 14,500 / Rejected 500
- When SKU Usable Supply is calculated
- Then it equals 10,000 + 24,000 + 14,500 = **48,500**, not 10,000 + 26,000 + 15,000 = 51,000
- And SKU A's balance is **1,500** and its status remains **Not Ready**
- Given packing has started before all cartons have arrived, with some quantities reported as pouches and some as completed cartons
- Then Packing % reflects completed cartons only
- Given a Shipment created during planning with no container number yet, later assigned `MSCU1234567`
- And 100 cartons were planned for loading but only 90 fit
- When loading is recorded
- Then the shipment line shows Short Loaded = 10, a reason is required and recorded, and the 10 cartons return to available finished stock
- Then the Export Order's SKU reconciliation shows Ordered / Stock Used / Production Accepted / Procurement Accepted / Packed / Loaded / Shipped / Balance, all computed from accepted/usable quantities

## 1. Quantity conversion (business-rules.md §2)

**AT-1.1** — Given a line ordered as 100 cartons with 25 pieces/pouch and 20 pouches/carton, when the line is saved, then `required_pieces = 50,000`, `required_pouches = 2,000`, `required_cartons = 100`.

**AT-1.2** — Given `customer_order_unit = Piece`, when saved, then `required_pieces` equals the entered quantity with no multiplication.

**AT-1.3** — Given a required-pieces figure that doesn't divide evenly into whole pouches, when pouch/carton quantities are computed, then the result rounds up (ceiling), never down.

**AT-1.4** — Given an `ExportOrderLine` already saved with frozen `pieces_per_pouch`/`pouches_per_carton`, when the master `products.CustomerSKUMapping` row is later changed, then the existing line's values and calculated quantities do not change.

## 2. PO & PO revisions (business-rules.md §9)

**AT-2.1** — Given an Export Order on PO Version 1, when PO Version 2 is uploaded, then Version 1 remains retrievable and Version 2 becomes `is_current = true`.

**AT-2.2** — Given multiple PO versions exist, when the Export Order is displayed, then it reflects the current version's data, and version history remains queryable.

## 3. Planning (business-rules.md §3)

**AT-3.1** — Given required = 50,000 and stock+produce+procure sums to 50,000, when the plan is saved, then it saves without error.

**AT-3.2** — Given required = 50,000 and stock+produce+procure sums to 45,000 with `is_intentionally_underplanned = false`, when saved, then the save is rejected.

**AT-3.3** — Given the same shortfall as AT-3.2 but `is_intentionally_underplanned = true` and a non-empty `remarks`, when saved, then it succeeds.

**AT-3.4** — Given `is_intentionally_underplanned = true` with an empty `remarks`, when saved, then the save is rejected.

**AT-3.5** — Given SKU Usable Supply ≥ required_pieces, when planning status is evaluated, then it becomes `READY`; given usable supply < required, then it is not `READY` regardless of gross produced/received figures (this is AT-0's core assertion, isolated as a unit test).

## 4. Production (business-rules.md §4)

**AT-4.1** — Given a Production Requirement planned for 25,000 and transactions summing to Accepted 24,000, when Production Progress is calculated, then it equals `24,000 / 25,000 = 96%`, and this value does not change if `quantity_produced` is edited independently.

**AT-4.2** — Given cumulative Accepted meets or exceeds the planned quantity, when the requirement's status is recalculated, then it becomes `READY`; given it falls short, it does not, regardless of `quantity_produced`.

**AT-4.3** — Given a `ProductionTransaction` payload referencing a non-existent `production_requirement`, when submitted, then the API rejects it (`400`).

**AT-4.4** — Given an existing transaction's `quantity_accepted` is corrected, when saved, then the change is visible in field history with old and new values, and the parent requirement's cumulative accepted total reflects the correction.

## 5. Procurement (business-rules.md §5)

**AT-5.1** — Given Planned Procurement 15,000 and cumulative Accepted 14,500, when Procurement Progress is calculated, then it equals `14,500 / 15,000` and never uses `quantity_received`.

**AT-5.2** — Given one `ProcurementReceipt` with lines for two different SKUs, when submitted, then both `ProcurementReceiptLine` rows are created atomically and each rolls up into its own requirement.

**AT-5.3** — Given cumulative Accepted meets or exceeds planned quantity, when status is recalculated, then the requirement becomes `READY`.

## 6. Packing materials & packing (business-rules.md §6)

**AT-6.1** — Given a `products.CustomerSKUMapping` row specifying 1 sticker/pouch and 2 silica gel/carton, and an order requiring 2,000 pouches / 100 cartons, when Packing Material Requirements are calculated, then Stickers = 2,000 and Silica Gel = 200.

**AT-6.2** — Given a `PackingTransaction` with `entry_type = CARTON_COMPLETED` and `cartons_packed = 10` (10 pieces/pouch × 20 pouches/carton = 200 pieces/carton), when saved, then `calculated_pieces = 2,000`, computed server-side — the client cannot submit its own `calculated_pieces`.

**AT-6.3** — Given 80 completed cartons against a requirement of 100, and an additional 150 pouches packed but not converted into cartons, when Packing % is displayed, then it shows 80% (80/100), with the 150 pouches shown as a separate figure, never blended into the 80%.

## 7. Loading & shipment (business-rules.md §7)

**AT-7.1** — Given a Shipment belonging to Export Order A, when a `ShipmentLine` is created referencing an `ExportOrderLine` that belongs to Export Order B, then the API rejects it.

**AT-7.2** — Given `planned_shipment_qty = 100` and `actual_loaded_qty = 90` submitted without a `variance_reason`, when saved, then the API rejects it (`400`) requiring `variance_reason`.

**AT-7.3** — Given the same scenario with a `variance_reason` provided, when saved, then `loading_status = SHORT_LOADED`, the difference is `-10`, and it succeeds.

**AT-7.4** — Given `actual_loaded_qty == planned_shipment_qty`, when saved, then `loading_status = EXACT` and no reason is required.

**AT-7.5** — Given 100 cartons packed and 90 loaded, when loading is confirmed, then `Product.available_qty` increases by 10 for that SKU.

**AT-7.6** — Given the system never exposes a way to attach `ShipmentLine`s from two different Export Orders to one `Shipment` (no multi-order consolidation feature exists), then the "one container, one customer" rule holds by construction — verify via a negative test that no API path allows it.

**AT-7.7** — Given an `ExportOrderLine`'s `required_pieces` is set, when any shipment/loading operation is performed, then `required_pieces` and `customer_ordered_qty` remain unchanged — only a tracked PO revision can change them.

## 8. Statuses & numbering (business-rules.md §8, §10)

**AT-8.1** — Given a new Export Order is created, when saved, then `order_number` is system-generated and unique.

**AT-8.2** — Given an Export Order `EO-2026-0045`, when its second Shipment is created, then its `shipment_number` is `EO-2026-0045-S02`.

**AT-8.3** — Given an order with two Shipments, one `Shipped` and one still `Packing`, when the Export Order's header status is computed, then it reflects the least-advanced shipment status (`Packing`) — pending PO confirmation per business-rules.md §7, keep this test aligned with whatever rule is confirmed.

## 9. Audit & corrections (business-rules.md §11)

**AT-9.1** — Given `ExportOrder.planned_ready_date` is changed, when saved without a `reason`, then the API rejects it; when saved with a `reason`, then a `DateRevision` row is created capturing previous and new date, and `original_planned_ready_date` is unchanged.

**AT-9.2** — Given any transactional record is edited by an authorized user, when saved, then `updated_by`/`updated_at` change and the prior state remains visible in field history.

## 10. Access & customer portal visibility (business-rules.md §13)

**AT-10.1** — Given a `CustomerUser` authenticated for Customer X, when requesting `/portal/orders/`, then only orders for Customer X are returned, never another customer's orders.

**AT-10.2** — Given a portal order detail response, when inspected, then it never contains vendor names, internal remarks, cost data, risk discussion, staff comments, or internal responsibility fields — verify by asserting the serializer's field allowlist, not by checking absence of specific values.

**AT-10.3** — Given a `ShipmentDocument` with `customer_visible = false`, when a portal user requests the order's documents, then that document is not in the response.

**AT-10.4** — Given each internal role in the permission matrix (ui-spec.md §7), when a user in that role calls an endpoint outside their allowed capability set, then the API returns `403`, except for the Export Coordinator's explicit fallback access to Production/Procurement/Packing entry endpoints.

## 11. Dashboard & reconciliation

**AT-11.1** — Given mixed accepted/gross figures across Production and Procurement for an order, when `/export-orders/{id}/reconciliation/` is called, then every stage value shown (Stock Used, Production Accepted, Procurement Accepted, Packed, Loaded, Shipped, Balance) uses accepted/usable quantities only, matching AT-0.

**AT-11.2** — Given the dashboard's Production/Procurement Status sections, when rendered, then the primary number is always Accepted/Planned — assert the API response has no field that would let the frontend accidentally render the gross figure as the headline.
