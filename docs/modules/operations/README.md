# Operations — Materials & Processes (V1)

Domain model, business rules, and UI map for the Settings > Operations / Master Data additions built from a wireframe of a "Processes" screen. One consolidated doc, not the 4-file split used by `docs/modules/export-orders/` — this feature is three simple CRUD master-data resources, not a business-rule-heavy domain.

## 1. Domain model

Three new models, two new Django apps.

### `apps.materials.Material` (Settings > Master Data > Materials)

A raw material / consumable master record — distinct from `apps.products.Product` (a sellable finished SKU). Same shape as Product: `code` (unique), `name`, `unit` (free text, no `UnitOfMeasure` model — matches `Product.base_unit`'s existing convention), `organization`, `is_active`. No delete route; `is_active` is the sole deactivation mechanism.

### `apps.processes.ProcessCategory` (Settings > Operations > Process Categories)

A configurable lookup for `Process.category` (e.g. Production, Quality, Packing, Movement) — `name` (unique) + `is_active`. No `code` field; there's no natural code concept for a category. Exists only to be selected from a Process; no delete route.

### `apps.processes.Process` (Settings > Operations > Processes)

A reusable activity definition used across Production, Packing and Inventory (e.g. Washing, Pressing, Packing). Fields: `name`, `category` (FK → ProcessCategory, PROTECT), `resource_type` (`TextChoices`: `STATION`/`MACHINE`/`LOCATION`), `inputs`/`outputs` (each a `ManyToManyField` → `Material`), `description`, `organization`, `is_active`.

**Inputs/Outputs are a plain list, no quantity.** This is the one deliberate deviation from this codebase's established "list of child rows" convention — every other such relationship (e.g. `export_orders.ShipmentLine`) is a full through-model with its own PK, exposed as a nested CRUD sub-resource, because it carries real per-relation metadata (planned quantity, remarks). A Process's Inputs/Outputs carry none — just "this process consumes/produces these materials" — so a bare `ManyToManyField`, serialized as `PrimaryKeyRelatedField(many=True)`, is the minimal thing that satisfies "linked list of Materials, editable on one page" (the config page is one page, not a per-row sub-resource flow). If a real need for per-relation quantity or ordering shows up later, migrating to a through-model is straightforward — this was a deliberate, flagged scope cut for V1, not an oversight.

## 2. Business rules

- **No delete, ever** — same convention as `Product`/`Customer`/`Vendor`: every viewset omits `DestroyModelMixin`; `is_active` is the only deactivation mechanism. `DELETE` returns `405` on all three resources.
- **`Duplicate`** (`POST /processes/{id}/duplicate/`) creates a new, always-active Process named `"<original> (Copy)"`, copying `category`/`resource_type`/`description`/`inputs`/`outputs` from the source. Never mutates the original. Follows the existing custom-action precedent (`ExportOrder.advance`/`.cancel`), not a new mechanism.
- **`Deactivate`** (a Process list row action) is just `PATCH {is_active: false}` — no confirmation dialog, same as every other `is_active` toggle in this app (e.g. Product/Material Active switch).
- **Permissions**: all three resources share the `IsInternalStaff` (list/read, every internal role) / `CanManageX` (`Export Coordinator` + `Manager/Admin`, create/update/duplicate) split already used by `Product`/`Customer`. `Vendor`'s read-only/admin-managed-only pattern was deliberately **not** used here — Materials and Processes need active day-to-day authoring by coordinators, unlike Vendors.
- **`Material.is_active`** gates what's selectable as a new Process's Input/Output (`ProcessSerializer.inputs`/`.outputs` querysets are `Material.objects.filter(is_active=True)`) — an already-deactivated Material can't be freshly attached, but existing attachments on an already-saved Process aren't retroactively stripped if a Material is deactivated later.

## 3. API surface

| Method | Path | Notes |
|---|---|---|
| GET/POST | `/materials/` | List (search `?search=`, filter `?is_active=`), create. |
| GET/PATCH | `/materials/{id}/` | Retrieve, update. No DELETE (405). |
| GET/POST | `/process-categories/` | List (search, `?is_active=`), create. |
| GET/PATCH | `/process-categories/{id}/` | Retrieve, update. No DELETE (405). |
| GET/POST | `/processes/` | List (search, `?is_active=`, `?category=<id>`), create. Response includes `category_name` (read-only join) alongside `category` (writable FK id). |
| GET/PATCH | `/processes/{id}/` | Retrieve, update. `inputs`/`outputs` are plain arrays of Material ids, read and write. No DELETE (405). |
| POST | `/processes/{id}/duplicate/` | Creates and returns the renamed, always-active copy described above. |

## 4. UI map

- **Settings > Master Data > Materials** (`frontend/src/modules/materials/`) — `MaterialListPage.tsx` (Code/Name/Unit/Status table, search, Active-only switch) + `MaterialFormPage.tsx` (Code immutable on edit, same rule as `Product.sku_code`).
- **Settings > Operations > Process Categories** (`frontend/src/modules/processes/ProcessCategoryListPage.tsx` / `ProcessCategoryFormPage.tsx`) — simplest pair, Name + Status only.
- **Settings > Operations > Processes** (`frontend/src/modules/processes/ProcessListPage.tsx` / `ProcessFormPage.tsx`):
  - List: search, Category filter (populated from Process Categories), Status filter (Active/Inactive), table columns Process/Category/**Inputs**/**Outputs**/Resource/Status — Inputs/Outputs render as plain counts (`inputs.length`/`outputs.length`), matching the source wireframe. Row click navigates to the full edit page (**no drawer**, per the wireframe's explicit note). A per-row Actions menu offers Edit / Duplicate / Deactivate, same `Dropdown` pattern as `ExportOrderListPage`'s row actions.
  - Form: one page, both create and edit — Process Name, Category (`Select`), Resource (`Select`, fixed Station/Machine/Location), Inputs and Outputs (`Select mode="multiple"`, options from the Materials list — **new pattern for this codebase**, there was no existing multi-select bound to another resource's ids to copy), Description, Active.

All three list/form pairs otherwise mirror `frontend/src/modules/products/{ProductListPage,ProductFormPage}.tsx` exactly in structure and conventions (breadcrumb back to Settings, `apiFetch`/`ApiError` shared client, same test shape).
