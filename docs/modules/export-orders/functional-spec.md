# Export Order Management — Functional Design & SDD Baseline v1.1

## 1. Purpose

The Export Order Management module will be the first module of the ERP.

Its purpose is to manage an export customer order from the time the customer Purchase Order is received until the order is fully completed.

The system should give the Export Coordinator one place to understand:

- What the customer ordered
- What stock is already available
- What needs to be produced
- What needs to be procured
- Whether packing materials are available
- Production progress
- Procurement progress
- Packing progress
- What has actually been loaded
- What has been shipped
- Whether the order is on time or delayed
- What documents are pending
- What quantity remains against each SKU

The module should be designed as the first part of a larger ERP.

Production, Procurement, Inventory, Packing and Finance will later become separate modules.

Therefore, Export Order Management should not duplicate those modules. It should consume their transactions and display the resulting status.

For V1, where those modules do not yet exist, authorised users should be able to manually enter the required transactions.

---

# 2. Core Business Flow

The high-level workflow is:

**Customer PO**

→ **Export Order**

→ **Planning**

→ **Packing**

→ **Loading**

→ **Shipping**

→ **Completion**

The four operational phases visible to users should remain:

1. **Planning**
2. **Packing**
3. **Loading**
4. **Shipping**

Keep these words simple throughout the application.

---

# 3. Core Record Hierarchy

The system hierarchy will be:

**Customer**

→ **Customer PO**

→ **Export Order**

→ **Export Order Lines / SKU Requirements**

→ **Shipment**

→ **Container**

An Export Order can have multiple Shipments.

A Shipment will normally map to one Container.

For the current business model:

> One Container must contain goods for only one Customer.

This should be enforced as a system business rule.

---

# 4. Typical Business Case

Most orders are expected to follow:

**1 Customer PO**

→ **1 Export Order**

→ **1 Shipment**

→ **1 Container**

However, the architecture must support:

**1 Customer PO**

→ **1 Export Order**

→ **Shipment 1**

→ **Shipment 2**

→ **Shipment 3**

For example, if one PO requires three containers.

Shipment records may be created before the actual container number is known.

Example:

**Shipment 1**

Planned Ready Date: 20 August  
Container Type: 40 HC  
Container Number: Not Assigned

Later:

Container Number: MSCU1234567

V1 does not require a separate provisional-container concept.

---

# 5. Customer PO Input

Customers may provide orders through:

- Formal customer Purchase Order
- Customer Excel file
- Order based on Proforma Invoice issued by the company
- Other customer-specific document formats

V1 should support manual entry of the PO.

The original source document should be attached to the Export Order.

Future versions may support:

- Excel import
- PDF extraction
- AI-assisted PO reading
- Automatic SKU matching

These are not required for V1.

---

# 6. Export Order Header

Each Export Order should contain at minimum:

- Export Order Number
- Customer
- Customer PO Number
- Customer PO Date
- Customer PO attachment
- Proforma Invoice reference, if applicable
- Currency
- Country
- Destination Port
- Requested Shipment Date
- Planned Container Ready Date
- Incoterm
- Payment Terms
- Bill To
- Ship To
- Export Coordinator
- Order Status
- Internal Remarks
- Customer-visible Remarks
- Created By
- Created Date
- Last Updated

---

# 7. PO Revision Management

Customer POs may change.

The original PO should not simply be overwritten.

The system should support PO revisions.

Example:

- PO Version 1
- PO Version 2
- PO Version 3

For each version retain:

- Version number
- Uploaded document
- Uploaded date
- Uploaded by
- Remarks
- Whether current version

The current Export Order should always reflect the latest accepted PO version.

Historical versions must remain available.

---

# 8. Export Order Line

Every customer PO item should become an Export Order Line.

Each line should contain:

- Line Number
- Customer SKU
- Customer Product Description
- Internal SKU
- Internal Product Description
- Customer Ordered Quantity
- Customer Order Unit
- Converted Piece Quantity
- Pieces per Pouch
- Pouches per Carton
- Pieces per Carton
- Required Cartons
- Required Pouches
- Customer-specific packing configuration
- Planned Ready Date
- Risk Status
- Line Status
- Remarks

---

# 9. Quantity Units

Customer orders may be received in:

- Pieces
- Pouches
- Cartons

The application must preserve the customer's original quantity and unit.

However:

> **Pieces will be the internal base quantity.**

Example:

Customer order:

**100 cartons**

Packing configuration:

**25 pieces per pouch**

**20 pouches per carton**

Therefore:

100 cartons  
= 2,000 pouches  
= 50,000 pieces

The system should store:

Customer Ordered Qty = 100  
Customer Unit = Cartons  
Internal Requirement = 50,000 pieces

This allows Production, Procurement and Stock quantities to be compared using one standard unit.

---

# 10. Customer SKU Mapping

The same internal product may have different customer descriptions or customer codes.

Therefore maintain:

## Customer SKU Mapping

Fields:

- Customer
- Customer SKU
- Customer Description
- Internal SKU
- Internal Description
- Active / Inactive

Example:

Customer:

ABC Foods

Customer SKU:

PLATE-10SQ-NAT

Customer Description:

10 Inch Natural Square Plate

Internal SKU:

SQ10

Internal Description:

10" Square Areca Plate

---

# 11. Customer-Specific Packing Configuration

Packing configuration may differ between customers even when the internal SKU is identical.

Therefore maintain:

## Customer SKU Packing Configuration

Fields may include:

- Customer
- Internal SKU
- Customer SKU
- Pieces per Pouch
- Pouches per Carton
- Pieces per Carton
- Pouch specification
- Pouch dimensions
- Carton specification
- Carton dimensions
- Sticker requirement
- Sticker type
- Silica Gel requirement
- Other packing materials
- Effective From
- Active / Inactive

The Export Order should copy the applicable configuration when the order is created.

Historical orders should not change merely because the master packing configuration is changed later.

---

# 12. Planning Phase

Planning determines how each SKU requirement will be fulfilled.

For every Export Order Line, the planning team should see:

**Required Quantity**

**Stock Available**

**Quantity from Stock**

**Quantity to Produce**

**Quantity to Procure**

A single SKU may use all three sources.

Example:

Order Requirement:

50,000 pieces

Plan:

10,000 from stock

25,000 to produce

15,000 to procure

Total:

50,000 pieces

The system should validate:

**Stock Allocation + Production Plan + Procurement Plan = Planned Requirement**

unless the line is intentionally under-planned and marked accordingly.

---

# 13. SKU-Level Planning Dates

Production and procurement dates must be planned against the individual SKU requirement.

They must not exist only at the PO or Export Order level.

Example:

SKU A:

Production completion: 16 August

SKU B:

Vendor delivery: 18 August

SKU C:

Production completion: 20 August

The overall shipment readiness may depend on these SKU-level dates, but the operational planned dates remain against each SKU requirement.

---

# 14. Supply Planning Entity

Create a separate entity:

## SKU Supply Plan

Suggested fields:

- Export Order Line
- Required Quantity
- Quantity from Stock
- Quantity to Produce
- Quantity to Procure
- Stock Availability Date
- Production Planned Start Date
- Production Expected Completion Date
- Procurement Planned Order Date
- Procurement Expected Receipt Date
- Overall SKU Expected Ready Date
- Responsible Person
- Responsible Team
- Risk Status
- Planning Status
- Remarks

A SKU may simultaneously have quantities under Stock, Production and Procurement.

This is a confirmed business rule.

---

# 15. Planning Status

Keep planning statuses simple:

- Not Started
- In Progress
- Ready
- Delayed

Risk may be separately maintained as:

- On Track
- At Risk
- Delayed

V1 can allow users to manually set Risk Status.

Advanced automatic risk calculation can be introduced later.

---

# 16. Production Requirement

When part of the requirement needs to be produced, create a Production Requirement linked to:

- Export Order
- Export Order Line
- SKU
- Required Production Quantity
- Planned Start Date
- Expected Completion Date
- Responsible Team
- Responsible Person
- Status

Production Requirement is not the same as Production Transaction.

Requirement represents:

**What needs to be produced.**

Transactions represent:

**What Production actually reports.**

---

# 17. Production Transactions

Production progress must be transaction-based.

Do not keep only one editable cumulative field called Produced Quantity.

Example:

| Date | SKU | Produced | Accepted | Rejected |
|---|---:|---:|---:|---:|
| 12 Aug | SKU A | 5,000 | 4,800 | 200 |
| 13 Aug | SKU A | 7,500 | 7,300 | 200 |

The system may store and display all three values:

- Produced
- Accepted
- Rejected

However:

> **Export Order readiness and progress must use only Accepted Production Quantity.**

Example:

Planned Production:

25,000

Produced:

26,000

Accepted:

23,000

Rejected:

3,000

For Export Order purposes:

**Production Available = 23,000**

**Production Progress = 23,000 / 25,000 = 92%**

The dashboard must not treat 26,000 as available.

Suggested Production Transaction fields:

- Date
- Production Requirement
- Export Order
- Export Order Line
- SKU
- Quantity Produced
- Quantity Accepted
- Quantity Rejected
- Entered By
- Source
- Remarks
- Created Date
- Updated Date

Source may initially be:

**Manual Entry**

Later:

**Production Module**

---

# 18. Procurement Requirement

Create a Procurement Requirement when goods must be sourced externally.

Suggested fields:

- Export Order Line
- SKU
- Vendor
- Required Quantity
- Planned Order Date
- Actual Order Date
- Vendor PO / Purchase Reference
- Expected Delivery Date
- Status
- Responsible Person
- Remarks

V1 should not become a complete Purchase Management system.

The Procurement Requirement exists to provide Export Order visibility.

Future Purchase ERP will own the actual Purchase Order.

---

# 19. Procurement Receipts

Procurement receipts may arrive in multiple lots.

Therefore use transaction records.

Suggested fields:

- Receipt Date
- Vendor
- Procurement Requirement
- Purchase Reference
- SKU
- Quantity Received
- Quantity Accepted
- Quantity Rejected
- Entered By
- Source
- Remarks
- Created Date
- Updated Date

One vendor receipt may contain multiple SKUs.

The data model should support this.

For Export Order purposes:

> **Only Accepted Procurement Quantity is available for fulfilment.**

Example:

Vendor Delivered:

15,000

Accepted:

14,200

Rejected:

800

Export Order availability from Procurement:

**14,200**

Procurement Progress:

**Accepted Procurement ÷ Planned Procurement**

---

# 20. Stock

V1 should initially remain simple.

For planning purposes, allow the coordinator to record or retrieve:

**Available Finished Quantity**

Later the Inventory module will provide this information automatically.

V1 does not require:

- Raw-material inventory
- Detailed warehouse bins
- Batch inventory
- Advanced stock reservation
- Full inventory valuation

---

# 21. Packing Material Planning

Packing materials are critical to Export Order readiness.

Examples include:

- Pouches
- Cartons
- Stickers
- Silica Gel
- Labels
- Inserts
- Other customer-specific materials

Packing material requirements should be calculated automatically wherever possible from the Customer SKU Packing Configuration.

Example:

Order:

50,000 plates

Configuration:

25 pieces / pouch

20 pouches / carton

1 sticker / pouch

2 silica gels / carton

System calculates:

2,000 pouches

100 cartons

2,000 stickers

200 silica gels

---

# 22. Packing Material Requirement

For each required packing material show:

- Material
- Required Quantity
- Available Stock
- Shortage
- Quantity Ordered
- Vendor
- Expected Arrival Date
- Actual Received Quantity
- Accepted Quantity, where inspection applies
- Status
- Responsible Person

Example:

| Material | Required | Stock | Shortage | Ordered | ETA |
|---|---:|---:|---:|---:|---|
| Pouches | 2,000 | 800 | 1,200 | 1,200 | 15 Aug |
| Cartons | 100 | 20 | 80 | 80 | 16 Aug |
| Stickers | 2,000 | 2,000 | 0 | 0 | — |

Later, Procurement and Inventory modules will provide these quantities.

---

# 23. Packing Phase

Packing must be monitored using daily transactions.

The packing team may report quantities in:

- Cartons
- Pouches

The system should automatically calculate equivalent pieces.

Do not ask users to manually enter calculated quantities.

---

# 24. Packing Conversion Rules

Example configuration:

25 pieces / pouch

20 pouches / carton

If packing team enters:

**10 cartons**

system calculates:

200 pouches

5,000 pieces

If packing team enters:

**80 pouches**

system calculates:

2,000 pieces

However:

> Pouches packed without completed cartons should not be counted as fully packed cartons.

This distinction is important.

---

# 25. Packing Transaction

Create a separate entity:

## Packing Transaction

Suggested fields:

- Date
- Export Order
- Export Order Line
- Shipment, if already allocated
- SKU
- Cartons Packed
- Pouches Packed
- Calculated Pieces
- Entry Type
- Entered By
- Packing Team
- Remarks
- Created Date
- Updated Date

Possible Entry Type:

- Carton Completed
- Pouch Packed

V1 may use simpler terminology if desired.

---

# 26. Packing Progress Calculation

Final Packing % should primarily represent completed cartons.

Example:

Required:

100 cartons

Completed Cartons:

80

Packing Progress:

80%

Pouches packed but not yet converted into completed cartons can be shown separately.

Example:

**Cartons Complete: 80 / 100**

**Additional Pouches Packed: 150**

This prevents an inflated packing percentage.

---

# 27. Daily Packing Plan

The system should support a planned packing window.

Example:

Packing Start:

12 August

Packing Completion:

18 August

Required:

700 cartons

Possible daily target:

100 cartons per day

The dashboard can compare cumulative:

| Day | Planned | Actual |
|---|---:|---:|
| Day 1 | 100 | 85 |
| Day 2 | 200 | 175 |
| Day 3 | 300 | 290 |

The packing plan may initially be simple and manually defined.

---

# 28. Shipment

Create Shipment records during planning.

A Shipment represents a planned movement of goods.

A shipment does not require a container number at the time of creation.

Suggested fields:

- Shipment Number
- Export Order
- Customer
- Shipment Status
- Planned Container Size
- Planned Ready Date
- Planned Stuffing Date
- Container Number
- Seal Number
- Shipping Line
- Booking Number
- Bill of Lading Number
- Vessel
- Freight Forwarder
- Port of Loading
- Destination Port
- Container Placement Date
- Actual Stuffing Date
- ETD
- ETA
- Shipment Value
- Currency
- Incoterm
- Payment Terms
- Bill To
- Ship To
- Remarks

---

# 29. Shipment Numbering

Every shipment should receive an internal Shipment Number even before the container number is known.

Example:

Export Order:

EO-2026-0045

Shipments:

EO-2026-0045-S01

EO-2026-0045-S02

EO-2026-0045-S03

The exact numbering scheme can remain configurable.

---

# 30. Shipment Line

Each Shipment should have Shipment Lines identifying the quantity of each Export Order SKU planned for that shipment.

Suggested fields:

- Shipment
- Export Order Line
- SKU
- Planned Shipment Quantity
- Planned Cartons
- Actual Loaded Quantity
- Actual Loaded Cartons
- Difference
- Loading Status
- Variance Reason

This enables one Export Order Line to be divided between multiple shipments.

---

# 31. Loading Phase

Loading records what physically went into the container.

For every SKU show:

**Ordered**

**Packed**

**Planned Load**

**Actual Loaded**

**Difference**

Example:

| SKU | Ordered | Packed | Planned Load | Actual Loaded | Difference |
|---|---:|---:|---:|---:|---:|
| SKU A | 100 | 100 | 100 | 90 | -10 |
| SKU B | 100 | 110 | 100 | 110 | +10 |
| SKU C | 50 | 50 | 50 | 50 | 0 |

---

# 32. Loading Difference

System-generated labels:

- Exact
- Short Loaded
- Excess Loaded

When Actual Loaded differs from Planned Load, a reason should be required.

Example reasons:

- Container space constraint
- Customer approved adjustment
- Additional space available
- Packing shortage
- Product shortage
- Weight restriction
- Other

No approval workflow is required in V1.

---

# 33. Leftover Packed Stock

Example:

Packed:

100 cartons

Loaded:

90 cartons

Balance:

10 cartons

The 10 cartons should return to available finished stock.

They should not remain permanently locked to the Export Order.

They may later be:

- Used for another shipment under the same Export Order
- Used against another customer order where applicable

Advanced inventory reservation logic can be introduced later.

---

# 34. Shipping Phase

Shipping begins after loading/stuffing is completed.

The system should capture logistics information such as:

- Container Number
- Seal Number
- Shipping Line
- Booking Number
- Bill of Lading Number
- Vessel Name
- Freight Forwarder
- Port of Loading
- Destination Port
- Factory Ready Date
- Container Placement Date
- Actual Stuffing Date
- ETD
- ETA
- Shipment Value
- Currency
- Incoterm
- Payment Terms

---

# 35. Shipment Documents

Documents should be maintained independently rather than as fixed fields on Shipment.

Create:

## Shipment Document

Fields:

- Shipment
- Document Type
- Status
- Document Number
- Document Date
- File Attachment
- Customer Visible
- Remarks
- Created By

Possible Document Types:

- Commercial Invoice
- Packing List
- Bill of Lading
- Certificate of Origin
- Fumigation Certificate
- Phytosanitary Certificate
- Test Certificate
- Shipping Bill
- Other

Possible statuses:

- Pending
- Ready
- Submitted
- Received

Document types should be configurable.

---

# 36. Planned Container Ready Date

The Planned Container Ready Date is one of the most important operational dates.

The system must maintain:

- Current Planned Ready Date
- Original Planned Ready Date
- Date Revision History

Example:

Original:

15 August

Revision 1:

18 August

Revision 2:

20 August

Current display:

20 August

Historical revisions must remain available.

---

# 37. Date Revision

Create a generic Date Revision / History mechanism for important dates.

Suggested fields:

- Record Type
- Record ID
- Date Type
- Previous Date
- New Date
- Revision Date
- Changed By
- Reason

At minimum use this for:

**Planned Container Ready Date**

Later this mechanism can support other planned dates.

---

# 38. Main Export Order Status

Recommended high-level statuses:

- Planning
- Packing
- Loading
- Shipped
- Complete
- Cancelled

Avoid excessive statuses.

Detailed statuses should remain inside the relevant phases.

---

# 39. Meaning of Shipped

**Shipped** means that the goods/container have completed the required shipping event defined by the business, generally after stuffing and sailing/shipment confirmation.

Payment does not need to be completed for the order to become Shipped.

---

# 40. Meaning of Complete

Long term:

**Complete** means shipment obligations and payment obligations are completed.

Because the Finance module is not part of V1, completion may initially be manually confirmed.

Future Finance integration should update this automatically.

---

# 41. SKU Reconciliation

Each Export Order Line must have a permanent reconciliation view.

The main Export Order reconciliation should use **accepted/usable quantities**, not gross output.

Recommended columns:

**Ordered**

**Stock Used**

**Production Accepted**

**Procurement Accepted**

**Packed**

**Loaded**

**Shipped**

**Balance**

Example:

| Stage | Qty |
|---|---:|
| Ordered | 50,000 |
| Stock Used | 10,000 |
| Production Produced | 26,000 |
| Production Accepted | 24,000 |
| Procurement Received | 15,000 |
| Procurement Accepted | 14,500 |
| Usable Supply | 48,500 |
| Packed | 48,000 |
| Loaded | 47,500 |
| Shipped | 47,500 |
| Balance | 2,500 |

Produced and Received values may be shown in detailed drill-down.

They must not be used as Export Order availability.

---

# 42. Roles

Initial roles:

## Export Coordinator

Can:

- Create Export Orders
- Enter PO lines
- Plan SKUs
- View all phases
- Enter manual transactions on behalf of other departments in V1
- Create Shipments
- View Packing
- Enter Loading details
- View Shipping
- Upload documents
- Manage customer-visible updates

## Production Coordinator

Can:

- View assigned Production Requirements
- Update production transactions
- Enter Produced Quantity
- Enter Accepted Quantity
- Enter Rejected Quantity
- Update expected dates
- Update status
- Add remarks

## Procurement Coordinator

Can:

- View Procurement Requirements
- Update vendors
- Update expected dates
- Record procurement receipts
- Enter Received Quantity
- Enter Accepted Quantity
- Enter Rejected Quantity
- Manage packing-material procurement updates

## Packing Coordinator

Can:

- View packing requirements
- Enter daily packing transactions
- View SKU packing progress
- Add remarks

## Logistics Coordinator

Can:

- Manage shipment details
- Container information
- Loading information
- Shipping dates
- Logistics references
- Shipment documents

## Manager / Admin

Can:

- View all data
- Override records where permitted
- Manage masters
- Manage users
- View performance dashboards

---

# 43. Permissions Philosophy

Each team should primarily update the information it owns.

However, because V1 will be launched before all ERP modules exist:

> Export Coordinator must be able to manually enter operational updates when required.

Every transaction should retain:

- Entered By
- Entry Date
- Source
- Last Updated By

This preserves accountability.

---

# 44. Manual vs Module-Sourced Data

Transactions should include a Source field.

Example:

- Manual
- Production Module
- Procurement Module
- Inventory Module
- Packing Module
- Finance Module
- Import

In V1, most entries may be Manual.

As future ERP modules are implemented, the source changes without changing the Export Order structure.

This is a critical architectural principle.

---

# 45. Export Coordinator Dashboard

The dashboard should answer:

## What requires attention today?

Recommended dashboard areas:

### Upcoming Shipments

Show:

- Customer
- Export Order
- Shipment
- Planned Ready Date
- Planned Stuffing Date
- Overall Progress
- Risk

### Orders at Risk

Show orders or SKUs marked:

- At Risk
- Delayed

### Production Status

The primary production number must be:

**Accepted Production / Planned Production**

Example:

**23,000 / 25,000 — 92%**

Produced and Rejected may be available on drill-down.

### Procurement Status

The primary procurement number must be:

**Accepted Procurement / Planned Procurement**

### Packing Material Shortages

Show packing materials that may delay packing.

### Packing Progress

Show:

- Planned cartons
- Packed cartons
- Percentage
- Target vs Actual

### Today's Actions

A simple task/action summary generated from outstanding requirements.

---

# 46. Export Order List Screen

Suggested columns:

- Export Order No.
- Customer
- Customer PO
- PO Date
- Destination
- Planned Ready Date
- Shipment Count
- Planning %
- Packing %
- Current Phase
- Risk
- Coordinator

Filters:

- Customer
- Coordinator
- Status
- Planned Ready Date
- Country
- Risk
- Shipment Status

---

# 47. Export Order Detail Screen

The Export Order detail should use clear tabs or sections:

### Overview

### SKU Planning

### Production

### Procurement

### Packing Materials

### Packing

### Shipments

### Loading

### Shipping

### Documents

### Activity / History

Avoid making users navigate through many unrelated ERP screens.

---

# 48. Overview Screen

Header:

**Customer**

**PO Number**

**Export Order Number**

**Planned Ready Date**

**Current Phase**

**Overall Risk**

Then show phase progress:

**Planning — 100%**

**Packing — 65%**

**Loading — 0%**

**Shipping — 0%**

Then:

### SKU Summary

### Packing Progress

### Shipment Summary

### Outstanding Actions

Any supply-readiness numbers shown here must use:

**Stock + Accepted Production + Accepted Procurement**

and never gross Produced or Received quantities.

---

# 49. SKU Planning Screen

Suggested table:

| SKU | Order Qty | Stock | Production Accepted | Procurement Accepted | Ready Qty | Balance | Expected Ready | Status | Risk |
|---|---:|---:|---:|---:|---:|---:|---|---|---|

Example:

| SKU | Order Qty | Stock | Prod. Accepted | Proc. Accepted | Ready | Balance |
|---|---:|---:|---:|---:|---:|---:|
| SKU A | 50,000 | 10,000 | 21,500 | 11,500 | 43,000 | 7,000 |

Clicking a SKU opens detailed planning.

Detailed planning can show:

### Requirement

### Stock

### Production

### Procurement

### Packing Materials

### Timeline

### Remarks

The Production drill-down may separately show:

- Produced
- Accepted
- Rejected

The Procurement drill-down may separately show:

- Received
- Accepted
- Rejected

---

# 50. Packing Monitor Screen

This should be one of the key operational screens.

Header:

**Shipment**

**Customer**

**Planned Stuffing**

**Packing Window**

**Overall Packing %**

SKU table:

| SKU | Required Cartons | Packed Cartons | Balance | Extra Pouches | Progress |
|---|---:|---:|---:|---:|---:|

Below this:

### Daily Packing

| Date | SKU | Cartons | Pouches | Pieces |

And:

### Plan vs Actual

This screen should later consume Packing Module data automatically.

---

# 51. Loading Screen

The loading screen should be optimized for container stuffing day.

Suggested table:

| SKU | Ordered | Planned Shipment | Packed | Loaded | Difference | Status | Reason |
|---|---:|---:|---:|---:|---:|---|---|

Allow quick entry of Actual Loaded Cartons.

System calculates:

- Pieces
- Difference
- Excess / Short
- Balance

---

# 52. Shipment Screen

Header:

**Shipment Number**

**Customer**

**Export Order**

**Container**

**Current Status**

Sections:

### Container

### Shipping Information

### Dates

### Loaded SKU Summary

### Documents

### Shipment Value

### Customer Information

---

# 53. Customer Portal

Customer portal can be included in V1 in a limited form.

Customer should have:

## Open Orders

## Past Orders

For an Export Order / Shipment the customer may see:

- PO Number
- Order status
- Packing Progress
- Planned Ready Date
- Container Number
- ETD
- ETA
- Shipping Line
- Selected Documents
- Customer-visible remarks

Internal data must remain hidden.

---

# 54. Customer Visibility

Do not hard-code separate versions of every screen.

Use visibility controls wherever appropriate.

Example:

Shipment Document:

**Customer Visible = Yes / No**

Remarks may be separated into:

**Internal Remarks**

and

**Customer Remarks**

Never expose:

- Supplier details
- Internal production issues
- Internal procurement remarks
- Staff comments
- Risk discussions
- Cost data
- Internal responsibility information

unless explicitly configured later.

---

# 55. Audit Trail

Important changes should retain history.

At minimum track:

- Order creation
- PO revision
- Quantity changes
- Planning changes
- Expected date changes
- Production updates
- Production Accepted Quantity changes
- Procurement receipts
- Procurement Accepted Quantity changes
- Packing entries
- Packing corrections
- Loading quantities
- Shipment details
- Document uploads
- Status changes

Every transaction should contain:

- Created By
- Created Date
- Updated By
- Updated Date

Critical changes should record old and new values.

---

# 56. Corrections

Transactions should ideally not be silently overwritten.

For V1, authorised users may edit mistakes, but change history should be maintained.

Future versions may implement reversal/correction transactions.

For Production and Procurement, corrections to Accepted Quantity are particularly important because they directly affect Export Order readiness.

---

# 57. Notifications — V1

Start with in-application notifications.

Potential notifications:

- New Production Requirement assigned
- New Procurement Requirement assigned
- Packing Material shortage
- Expected completion date missed
- Shipment approaching Planned Ready Date
- Packing delayed
- Container assigned
- Shipment loaded
- Shipment sailed

Later, notifications may also trigger when:

- Accepted Production is behind plan
- Accepted Procurement is behind plan

Email and WhatsApp notifications are not required for initial V1.

---

# 58. Important System Calculations

## Pieces per Carton

**Pieces per Pouch × Pouches per Carton**

## Required Pouches

**Required Pieces ÷ Pieces per Pouch**

## Required Cartons

**Required Pouches ÷ Pouches per Carton**

Appropriate whole-pack rounding rules must apply.

## Planning Balance

**Required Qty − Stock Plan − Production Plan − Procurement Plan**

## Production Progress

**Cumulative Accepted Production ÷ Planned Production Quantity**

Do not use Produced Quantity.

## Production Balance

**Planned Production Quantity − Cumulative Accepted Production**

## Procurement Progress

**Cumulative Accepted Procurement ÷ Planned Procurement Quantity**

Do not use gross Received Quantity.

## Procurement Balance

**Planned Procurement Quantity − Cumulative Accepted Procurement**

## SKU Usable Supply

**Available/Allocated Stock + Accepted Production + Accepted Procurement**

## SKU Supply Balance

**SKU Requirement − SKU Usable Supply**

## Packing %

**Completed Cartons ÷ Required Cartons**

## Loading Difference

**Actual Loaded − Planned Load**

## Shipment Balance

**Planned Shipment Qty − Actual Loaded Qty**

## Export Order Remaining Balance

**Order Qty − Cumulative Shipped Qty**

---

# 59. Important Validations

The system must validate that:

1. Internal SKU is assigned before operational planning.

2. Packing configuration exists before carton/pouch conversions are calculated.

3. Piece conversion cannot be manually altered after the packing basis has been fixed without authorised revision.

4. One container cannot contain multiple customers.

5. Shipment must belong to an Export Order.

6. Shipment Lines must reference Export Order Lines belonging to the same Export Order.

7. Actual Loaded Quantity may differ from planned quantity, but a reason is required when there is a difference.

8. Customer users cannot access internal-only fields.

9. Production transactions must reference a valid Production Requirement.

10. Procurement receipts must reference valid Procurement Requirements where applicable.

11. Packing transactions must reference valid Export Order Lines.

12. Shipment quantity cannot silently change the original PO quantity.

13. Changes to planned dates should retain history.

14. Export Order production readiness must be based on Accepted Production Quantity.

15. Export Order procurement readiness must be based on Accepted Procurement Quantity.

16. Gross Produced Quantity must not be treated as available supply.

17. Gross Received Quantity must not be treated as available supply.

18. A Production Requirement becomes Ready only when cumulative Accepted Production meets or exceeds the planned requirement.

19. A Procurement Requirement becomes Ready only when cumulative Accepted Procurement meets or exceeds the planned requirement.

---

# 60. What V1 Should Include

V1 should contain:

### Masters

- Customer
- SKU
- Customer SKU Mapping
- Customer SKU Packing Configuration
- Packing Material
- User / Employee
- Basic Vendor

### Export Orders

- Export Order creation
- PO attachment
- PO revisions
- SKU lines
- Quantity conversion

### Planning

- Stock plan
- Production plan
- Procurement plan
- SKU-level planned dates
- Responsibility
- Risk
- Packing Material requirements

### Operational Transactions

- Manual Production Updates
- Produced Quantity
- Accepted Production Quantity
- Rejected Production Quantity
- Manual Procurement Receipts
- Received Quantity
- Accepted Procurement Quantity
- Rejected Procurement Quantity
- Manual Packing Transactions

### Shipments

- Multiple Shipments per Export Order
- Shipment Lines
- Container assignment
- Loading
- Excess / shortage
- Shipping information
- Shipment documents

### Dashboards

- Export Coordinator dashboard
- Export Order overview
- SKU planning
- Packing monitor
- Shipment / Loading view

### Customer Portal

Limited customer-visible order and shipment tracking.

---

# 61. What V1 Should NOT Include

Do not build the following as part of Export Order Manager V1:

- Complete Production Planning ERP
- Machine scheduling
- Raw-material planning
- Full inventory system
- Warehouse bin management
- Full Purchase Request system
- Full Purchase Order system
- Vendor approvals
- Full Finance system
- Accounts Receivable
- Tally integration
- Payment reconciliation
- Automatic PO PDF reading
- AI document extraction
- WhatsApp integration
- Advanced inventory reservations
- Advanced workflow engine
- Complicated approval hierarchy
- Automatic predictive risk engine
- Advanced shipping-line integrations

These should become future ERP modules or enhancements.

---

# 62. Future Module Integration

The design must assume these future modules:

## Inventory

Will provide:

- Available stock
- Reservations
- Finished goods receipts
- Stock movements

## Production

Will provide:

- Production orders
- Production transactions
- Produced quantities
- Accepted quantities
- Rejected quantities
- Expected completion dates

Export Order Management should consume **Accepted Production Quantity** as available supply.

## Procurement

Will provide:

- Purchase Requests
- Purchase Orders
- Vendor commitments
- Goods receipts
- Received quantities
- Accepted quantities
- Rejected quantities
- Packing material purchases

Export Order Management should consume **Accepted Procurement Quantity** as available supply.

## Packing

Will provide:

- Daily packing transactions
- Packing team activity
- Carton completion
- Packing QC

## Finance

Will provide:

- Invoice
- Receivables
- Payment status
- Order completion

Export Order Management should receive and aggregate this information.

---

# 63. Architectural Principle

The Export Order module should behave as an:

## **Order Orchestration Layer**

It should answer:

> What must happen to fulfil this customer order, and where does each requirement currently stand?

It should not attempt to become the owner of every underlying business process.

A second important architectural principle is:

> **Operational output and Export Order usable supply are not always the same.**

Production may produce 10,000 pieces, but if only 9,500 are accepted, Export Order availability is 9,500.

Procurement may receive 15,000 pieces, but if only 14,200 are accepted, Export Order availability is 14,200.

This rule must be consistent across database queries, APIs, dashboards and reports.

---

# 64. Recommended Core Entities

The initial logical entity list is:

### Masters

1. Customer
2. Customer Address
3. SKU
4. Customer SKU Mapping
5. Customer SKU Packing Configuration
6. Packing Material
7. Vendor
8. User
9. Employee / Team

### Export Order

10. Export Order
11. Export Order PO Version
12. Export Order Line

### Planning

13. SKU Supply Plan
14. Stock Allocation
15. Production Requirement
16. Procurement Requirement
17. Packing Material Requirement

### Transactions

18. Production Transaction
19. Procurement Receipt
20. Procurement Receipt Line
21. Packing Transaction

### Shipment

22. Shipment
23. Shipment Line
24. Container
25. Loading Transaction / Loading Line
26. Shipment Document

### Common

27. Date Revision
28. Comment / Remark
29. Attachment
30. Activity Log
31. Notification

The Production Transaction must separately support:

- Produced Quantity
- Accepted Quantity
- Rejected Quantity

The Procurement Receipt Line must separately support:

- Received Quantity
- Accepted Quantity
- Rejected Quantity

This entity list can be refined when the technical schema is created.

---

# 65. Suggested V1 Navigation

Keep the main navigation simple:

**Dashboard**

**Export Orders**

**Packing Monitor**

**Shipments**

**Customers**

**Products**

**Masters**

Do not expose technical module names such as:

- Production Transaction
- Supply Allocation
- Procurement Receipt Line

to normal users.

Those are implementation concepts.

---

# 66. Design Philosophy

The application should feel closer to a modern operational dashboard than a traditional ERP.

Users should not have to understand accounting or ERP terminology.

Prefer:

**Need to Produce**

instead of:

Production Supply Allocation

Prefer:

**Accepted from Production**

instead of:

QC Released Production Quantity

Prefer:

**Need to Procure**

instead of:

External Procurement Requirement Allocation

Prefer:

**Accepted from Vendor**

instead of:

Accepted Goods Receipt Quantity

Prefer:

**Packed**

instead of:

Fulfilment Completion Quantity

Prefer:

**Ready Date**

instead of:

Material Availability Commitment Date

The application should use language familiar to the team.

---

# 67. Progressive ERP Strategy

This module should establish patterns that can later be reused across the ERP:

- Master data
- Role-based access
- Transactions
- Audit trail
- Attachments
- Comments
- Notifications
- Status management
- Department ownership
- Dashboards
- Customer portal
- API integration

Therefore, these common capabilities should be designed carefully even though Export Order Management is the first business module.

The database should preserve enough operational detail for future modules without making the V1 user interface complicated.

---

# 68. Suggested Development Sequence

## Phase 1 — Foundation

Build:

- Authentication
- Users
- Roles
- Customers
- SKUs
- Customer SKU mappings
- Packing configurations

## Phase 2 — Export Order

Build:

- Export Order
- PO upload
- SKU lines
- Quantity conversions
- PO revisions

## Phase 3 — Planning

Build:

- Stock allocation
- Production Requirement
- Procurement Requirement
- Packing Material Requirement
- SKU dates
- Responsibility
- Risk

## Phase 4 — Daily Operations

Build:

- Production Transactions
- Produced / Accepted / Rejected quantities
- Procurement Receipts
- Received / Accepted / Rejected quantities
- Packing Transactions
- Progress calculations using Accepted quantities

## Phase 5 — Shipment

Build:

- Shipment
- Shipment Lines
- Container
- Loading
- Variances
- Shipping information

## Phase 6 — Dashboard

Build:

- Export Coordinator Dashboard
- Planning Dashboard
- Packing Monitor
- Shipment Overview

## Phase 7 — Customer Portal

Build:

- Customer login
- Open Orders
- Past Orders
- Progress
- Shipment tracking
- Documents

---

# 69. Core Acceptance Scenario

The application should successfully handle this scenario:

Customer sends a PO containing 20 SKUs.

The PO quantities include a mixture of:

- Cartons
- Pouches
- Pieces

The Export Coordinator creates the Export Order.

Customer SKUs are mapped to internal SKUs.

The system converts all requirements into pieces.

For SKU A:

**50,000 pieces required**

Planning determines:

- 10,000 from Stock
- 25,000 from Production
- 15,000 from Procurement

Production Expected Ready:

16 August

Procurement Expected Ready:

18 August

These planned dates are against the individual SKU requirement.

Production reports:

- Produced: 26,000
- Accepted: 24,000
- Rejected: 2,000

Procurement arrives in two lots and cumulatively reports:

- Received: 15,000
- Accepted: 14,500
- Rejected: 500

The Export Order must calculate:

Stock:

10,000

Accepted Production:

24,000

Accepted Procurement:

14,500

Therefore:

**Usable Supply = 48,500**

**Requirement = 50,000**

**Balance = 1,500**

The SKU must remain:

**Not Ready**

The system must not incorrectly calculate:

10,000 + 26,000 + 15,000 = 51,000

and mark the SKU Ready.

Packing Material requirements are automatically calculated.

Packing starts before all cartons arrive.

Packing team reports some quantities as pouches and some as completed cartons.

Only completed cartons contribute to final Packing %.

A Shipment is already created during planning.

The actual container number is assigned later.

During loading:

100 cartons were planned.

Only 90 cartons fit.

System records:

**Short Loaded = 10 cartons**

Reason:

**Container Space Constraint**

The 10 cartons return to available finished stock.

The Shipment receives:

- Container Number
- Seal Number
- Booking
- Shipping Line
- ETD
- ETA
- Bill of Lading
- Shipping documents

The customer portal displays only customer-approved information.

The Export Order retains a SKU-level reconciliation showing:

- Ordered
- Stock Used
- Production Accepted
- Procurement Accepted
- Packed
- Loaded
- Shipped
- Balance

If this entire scenario works correctly, the core Export Order Management V1 is functioning as intended.

---

# 70. Definition of V1 Success

V1 will be considered successful when the Export Coordinator no longer needs a separate Excel or Google Sheet to answer:

> What is happening with this Export Order?

At any point, the coordinator should be able to open the Export Order and determine:

**What is pending?**

**Who is responsible?**

**When will each SKU be ready?**

**How much has Production produced?**

**How much has Production accepted?**

**How much accepted Production quantity is actually available for the order?**

**How much has arrived from vendors?**

**How much has been accepted from vendors?**

**Are packing materials ready?**

**How much has been packed?**

**What was actually loaded?**

**When is it sailing?**

**What is still pending against the customer's PO?**

The system must always distinguish:

### Production

**Produced → Accepted → Available for Export Order**

### Procurement

**Received → Accepted → Available for Export Order**

### Packing

**Accepted/Available Product → Packed → Ready for Loading**

### Loading

**Packed → Actual Loaded**

### Shipping

**Actual Loaded → Shipped**

The fundamental source-of-truth rule for Export Order fulfilment is:

> **Only accepted quantities from Production and Procurement contribute toward Export Order availability, readiness, progress and planning completion.**

Gross Produced Quantity and gross Received Quantity remain operational information only.

That rule must be followed consistently across:

- Database calculations
- APIs
- Dashboards
- Progress percentages
- SKU readiness
- Shipment readiness
- Reconciliation
- Reports
- Acceptance tests
- Future integrations

The primary product objective of Export Order Management V1 remains:

> **One reliable operational system that tells the Export Coordinator exactly where every customer order and every SKU stands without depending on a separate Excel or Google Sheet.**