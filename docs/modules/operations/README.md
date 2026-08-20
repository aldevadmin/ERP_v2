# Operations — Materials & Processes (V1)

Domain model, business rules, and UI map for the Settings > Operations / Master Data additions built from a wireframe of a "Processes" screen. One consolidated doc, not the 4-file split used by `docs/modules/export-orders/` — this feature is three simple CRUD master-data resources, not a business-rule-heavy domain.

## 1. Domain model

Three new models, two new Django apps.

### `apps.materials.Material` (Settings > Master Data > Materials)

A raw material / consumable master record — distinct from `apps.products.Product` (a sellable finished SKU). Same shape as Product: `code` (unique), `name`, `unit` (free text, no `UnitOfMeasure` model — matches `Product.base_unit`'s existing convention), `organization`, `is_active`. No delete route; `is_active` is the sole deactivation mechanism.

### `apps.processes.ProcessCategory` (Settings > Operations > Process Categories)

A configurable lookup for `Process.category` (e.g. Production, Quality, Packing, Movement) — `name` (unique) + `is_active`. No `code` field; there's no natural code concept for a category. Exists only to be selected from a Process; no delete route.

### `apps.processes.Process` (Settings > Operations > Processes)

A reusable activity definition used across Production, Packing and Inventory (e.g. Washing, Pressing, Packing). Fields: `name`, `code` (unique), `category` (FK → ProcessCategory, PROTECT), `resource_type` (`TextChoices`: `STATION`/`MACHINE`/`LOCATION`, **optional** — `blank=True`), `inputs`/`outputs` (each a `ManyToManyField` → `Material`), `description`, `organization`, `is_active`.

Built up over a multi-step configuration wizard (Basics, Inputs, Outputs, Work Centre, Output Capture, Parameters, Rules, Review — see §4). Only **Basics** (`name`/`code`/`category`/`description`) is implemented so far, which is why `resource_type` — set on the not-yet-built Work Centre step — has to be optional: a Process can exist as a Basics-only draft with no resource assigned yet. `category`, collected by Basics itself, stays required.

**Inputs/Outputs are a plain list, no quantity.** This is the one deliberate deviation from this codebase's established "list of child rows" convention — every other such relationship (e.g. `export_orders.ShipmentLine`) is a full through-model with its own PK, exposed as a nested CRUD sub-resource, because it carries real per-relation metadata (planned quantity, remarks). A Process's Inputs/Outputs carry none — just "this process consumes/produces these materials" — so a bare `ManyToManyField`, serialized as `PrimaryKeyRelatedField(many=True)`, is the minimal thing that satisfies "linked list of Materials, editable on one page" (the config page is one page, not a per-row sub-resource flow). If a real need for per-relation quantity or ordering shows up later, migrating to a through-model is straightforward — this was a deliberate, flagged scope cut for V1, not an oversight.

## 2. Business rules

- **No delete, ever** — same convention as `Product`/`Customer`/`Vendor`: every viewset omits `DestroyModelMixin`; `is_active` is the only deactivation mechanism. `DELETE` returns `405` on all three resources.
- **`Duplicate`** (`POST /processes/{id}/duplicate/`) creates a new, always-active Process named `"<original> (Copy)"` with code `"<original code>-COPY"` (`-COPY-2`, `-COPY-3`, ... if that's already taken — `code` is unique, so a plain suffix isn't enough on a second or third duplicate), copying `category`/`resource_type`/`description`/`inputs`/`outputs` from the source. Never mutates the original. Follows the existing custom-action precedent (`ExportOrder.advance`/`.cancel`), not a new mechanism.
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
| GET/POST | `/processes/` | List (search, `?is_active=`, `?category=<id>`), create. `code` is required and unique; `resource_type`/`inputs`/`outputs` may be omitted entirely (Basics-only create). Response includes `category_name` (read-only join) alongside `category` (writable FK id). |
| GET/PATCH | `/processes/{id}/` | Retrieve, update. `inputs`/`outputs` are plain arrays of Material ids, read and write. No DELETE (405). |
| POST | `/processes/{id}/duplicate/` | Creates and returns the renamed, always-active copy described above. |

## 4. UI map

- **Settings > Master Data > Materials** (`frontend/src/modules/materials/`) — `MaterialListPage.tsx` (Code/Name/Unit/Status table, search, Active-only switch) + `MaterialFormPage.tsx` (Code immutable on edit, same rule as `Product.sku_code`).
- **Settings > Operations > Process Categories** (`frontend/src/modules/processes/ProcessCategoryListPage.tsx` / `ProcessCategoryFormPage.tsx`) — simplest pair, Name + Status only.
- **Settings > Operations > Processes** (`frontend/src/modules/processes/ProcessListPage.tsx` / `ProcessFormPage.tsx`):
  - List: search, Category filter (populated from Process Categories), Status filter (Active/Inactive), table columns Process/Category/**Inputs**/**Outputs**/Resource/Status — Inputs/Outputs render as plain counts (`inputs.length`/`outputs.length`), Resource renders `—` for a Basics-only Process with no `resource_type` set yet. Row click navigates to the full edit page (**no drawer**, per the wireframe's explicit note). A per-row Actions menu offers Edit / Duplicate / Deactivate, same `Dropdown` pattern as `ExportOrderListPage`'s row actions.
  - Form: a **multi-step wizard shell**, redesigned from an earlier single-page form to match a second wireframe showing 8 steps — Basics, Inputs, Outputs, Work Centre, Output Capture, Parameters, Rules, Review. A left-hand step list (bullet indicator, current step highlighted) sits beside a right-hand content panel; a "Save Draft" button sits in the header, independent of the per-step "Continue →" flow. **Only Basics is actually implemented** — What should this process be called? (Name), Process Code (auto-slugified from Name until hand-edited, then locked; immutable once the Process is saved, same rule as `Product.sku_code`), "Where will this process normally be used?" (a `Radio.Group`, one radio per active Process Category — this **is** the `category` field, just rendered as radio buttons instead of a dropdown), Description. The other 7 steps are freely clickable from the nav and each shows a plain "`<Step>` isn't built yet." panel (`Empty`, same idiom as the Production/Packing/Inventory placeholder pages) — no gating on whether Basics has been saved yet.
  - **Continue** and **Save Draft** both persist the Basics fields as-is (`createProcess`/`updateProcess` with only `name`/`code`/`category`/`description` — `resource_type`/`inputs`/`outputs` are simply omitted from the payload, which the backend now accepts since only `category` is required at this stage). Continue then advances the wizard to the Inputs placeholder *without navigating away* — the created Process's id is kept in local component state, so the URL stays `/processes/new` until the user leaves; Save Draft instead returns to the Processes list. Once a Process exists (either via Continue or by loading `/processes/:id/edit` directly), Process Code becomes read-only and the page header switches from "Create Process" to "Edit Process".

Materials and Process Categories mirror `frontend/src/modules/products/{ProductListPage,ProductFormPage}.tsx` exactly in structure and conventions (breadcrumb back to Settings, `apiFetch`/`ApiError` shared client, same test shape). The Process list page follows the same list conventions; the Process form page is the one deliberate departure — a wizard shell rather than a single Card-centered form, per the second wireframe.
