# Items — Classification & Grading Guide

How to model an item's class, and how to represent a product that comes out of production or procurement in more than one quality grade. This is a design guide for whoever configures new items, not a field-by-field API spec — for exact fields, read `apps/items/models.py`, `apps/processes/models.py` (`OutputClassification`, `ProcessOutputDefinition`), and `apps/product_routes/models.py` (`ProcessRouteEdge`) directly; they're the source of truth.

## 1. Item classes

One `Item` table, distinguished by `item_class`:

| Class | Use for | Typical capabilities |
|---|---|---|
| Raw Material | Anything bought from outside and fed into your own process — whether truly raw, or already part-processed by a vendor (e.g. job-work pressing). | Bought, Stocked |
| WIP | An in-between output *your own* process creates — not sellable yet. Only needed if you track/stock that intermediate stage separately. Single-step routes usually skip this. | Made, Stocked |
| Finished Good | The final product sold to a customer — what appears on Export Order lines and Customer Product Mappings. | Made, Stocked, Sold |
| Packaging Material | Pouches, cartons, labels — consumed while packing a Finished Good. Selectable in a Packaging Profile's materials list. | Bought, Stocked |
| Consumable | Used up during production/packing but not part of the product itself — tape, gloves, cleaning supplies. | Bought, Stocked |
| Scrap / By-Product | Waste or secondary output from a process — trimmings, rejects — tracked but not sold as the main product. | Stocked |

**Not everything purchased belongs in this catalog.** Mechanical spare parts, machine components, and other capital/maintenance purchases don't fit any class here — they have no product type, aren't consumed into a bill of materials, and would just be noise in every Item picker (Product Routes, Packaging Profiles, Customer Mappings). Keep those out of Items; they're a Purchasing/Asset-Maintenance concern for a future module, not this one.

## 2. One customer can have several SKUs for the same item

`CustomerProductMapping` is keyed on `(customer, customer_sku)`, not `(customer, item)` — a customer can hold multiple simultaneous mappings against the same `Item` (e.g. two pack sizes sold as two different SKUs), each pinning its own Packaging Profile version, price, and requirements. `customer_sku` is fixed at creation since it's part of that row's identity, not a commercial detail that can drift across versions.

## 3. Grading: one physical product, several quality outcomes

A production run isn't always uniform — e.g. a press run of 10″ plates naturally splits into Premium and Standard, and vendor-sourced material graded "Premium" on paper can be downgraded on your own inspection. **This is not a reason to create an Item per source.** Every quality path should converge on the same handful of sellable grades.

### Worked example — 10″ Square Plate, in-house and vendor-sourced

| Item | Class | Role |
|---|---|---|
| 10″ Sq Plate — Unsorted | WIP | Raw output of your own press; not sellable yet |
| 10″ Sq Plate — Vendor Sorted Premium | Raw Material | What you procure — kept separate so receiving keeps its own Accepted/Rejected trail back to that vendor |
| 10″ Sq Plate — Premium | Finished Good | The one sellable Premium SKU — fed by *either* path below |
| 10″ Sq Plate — Standard | Finished Good | The one sellable Standard SKU — fed by *either* path below |

Two Sorting-type processes wire both paths onto the same two Finished Goods, using `OutputClassification` (seeded PREMIUM/STANDARD/GOOD/REJECT/SCRAP/OTHER, extendable from Settings) on each `ProcessOutputDefinition` row:

| Path | Input Item | Sorting Process | Output → Item (classification) |
|---|---|---|---|
| In-house | Unsorted (WIP) | Sorting | Premium item — classification `Premium` |
| | | | Standard item — classification `Standard` |
| | | | Reject — classification `Reject`, `can_move_forward=False`, routed to a storage location — **no Item** |
| Vendor-sourced | Vendor Sorted Premium (Raw Material) | Vendor QA Sort | Premium item — *same item* as the in-house path |
| | | | Standard item — *same item*, if downgraded |

`ProcessRouteEdge.source_output_definition` is what turns a branching output (Premium/Standard/Reject) into distinct route edges — this is exactly the mechanism the route model was built for (see its docstring).

**Why converge instead of splitting by source:** once a unit is graded Premium, a customer buying Premium doesn't need to know whether it came off your own line or was accepted from a vendor — one Item, one Customer Product Mapping, one price. Provenance (which route/process produced a given lot) stays in the process/route execution history, not in the item catalog.

### Rule of thumb

Create a new Item only when something is genuinely sold or stocked differently:

- Same grade, different source → **converge** on one Finished Good Item (§3).
- Same item, different pack size or different customer → **new Customer Product Mapping SKU**, not a new Item (§2).
- Different quality grade of the same physical product → **new Finished Good Item**, one per grade, fed by however many Sorting processes apply (§3).

## Known gap

This covers configuration only. Actually recording real production-run results against these classifications — the "Production tracks Produced/Accepted/Rejected" rule in the root `CLAUDE.md` — needs a Production module that tracks quantities per run, which doesn't exist yet. Today this guide sets up the plan; it doesn't yet give a way to log real output splits against it.
