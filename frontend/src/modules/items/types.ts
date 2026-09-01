export type ItemClass =
  | 'RAW_MATERIAL'
  | 'WIP'
  | 'FINISHED_GOOD'
  | 'PACKAGING_MATERIAL'
  | 'CONSUMABLE'
  | 'SCRAP_BY_PRODUCT'

export const ITEM_CLASS_OPTIONS: { value: ItemClass; label: string }[] = [
  { value: 'RAW_MATERIAL', label: 'Raw Material' },
  { value: 'WIP', label: 'WIP' },
  { value: 'FINISHED_GOOD', label: 'Finished Good' },
  { value: 'PACKAGING_MATERIAL', label: 'Packaging Material' },
  { value: 'CONSUMABLE', label: 'Consumable' },
  { value: 'SCRAP_BY_PRODUCT', label: 'Scrap / By-Product' },
]

/** Short abbreviation for each `ItemClass`, for the `{class_short}` naming
 * token — same idea as `ProductType.short_code`/`MaterialType.short_code`,
 * but hardcoded rather than admin-editable, since `ItemClass` itself is a
 * fixed code-level enum, not a master (see `Item`'s docstring for why). */
export const ITEM_CLASS_SHORT_LABELS: Record<ItemClass, string> = {
  RAW_MATERIAL: 'RM',
  WIP: 'WIP',
  FINISHED_GOOD: 'FG',
  PACKAGING_MATERIAL: 'PKG',
  CONSUMABLE: 'CON',
  SCRAP_BY_PRODUCT: 'SCR',
}

export type DimensionUOM = 'IN' | 'CM' | 'MM'

export const DIMENSION_UOM_OPTIONS: { value: DimensionUOM; label: string }[] = [
  { value: 'IN', label: 'in' },
  { value: 'CM', label: 'cm' },
  { value: 'MM', label: 'mm' },
]

export type LotTracking = 'NONE' | 'OPTIONAL' | 'REQUIRED'

export const LOT_TRACKING_OPTIONS: { value: LotTracking; label: string }[] = [
  { value: 'NONE', label: 'None' },
  { value: 'OPTIONAL', label: 'Optional' },
  { value: 'REQUIRED', label: 'Required' },
]

/** Which of Product Type/Material/Shape/Dimensions is Required, Optional,
 * or Hidden for a given `ItemClass` — admin-configurable via the Item
 * Classification settings screen (see `ItemClassificationSettingsPage`),
 * backed by `apps.items.models.ItemFieldRule` on the server.
 * `inventory_uom` is always required for every class with no demonstrated
 * need to vary, so it isn't part of this — see that model's docstring. */
export type ItemFieldRuleField = 'product_type' | 'material_type' | 'shape' | 'dimensions'
export type ItemFieldRuleState = 'REQUIRED' | 'OPTIONAL' | 'HIDDEN'

export interface ItemFieldRule {
  id: number
  item_class: ItemClass
  field: ItemFieldRuleField
  state: ItemFieldRuleState
}

/** {field: state} for one item class, picked out of the full fetched rule
 * set — the frontend mirror of the backend's `_field_rules_for_class`
 * helper in `apps/items/serializers.py`, kept in sync by hand since one
 * is Python and the other TypeScript. */
export function fieldRulesForClass(
  rules: ItemFieldRule[],
  itemClass: ItemClass,
): Partial<Record<ItemFieldRuleField, ItemFieldRuleState>> {
  const result: Partial<Record<ItemFieldRuleField, ItemFieldRuleState>> = {}
  for (const rule of rules) {
    if (rule.item_class === itemClass) result[rule.field] = rule.state
  }
  return result
}

export interface Item {
  id: number
  code: string
  name: string
  description: string
  item_class: ItemClass
  product_type: number | null
  product_type_name: string
  material_type: number | null
  material_type_name: string
  shape: number | null
  shape_name: string
  length: string | null
  breadth: string | null
  height: string | null
  length_uom: DimensionUOM | null
  breadth_uom: DimensionUOM | null
  height_uom: DimensionUOM | null
  inventory_uom: number | null
  inventory_uom_code: string
  purchasable: boolean
  manufacturable: boolean
  stockable: boolean
  sellable: boolean
  lot_tracking: LotTracking
  is_active: boolean
  available_qty: number
}

export interface ItemListResponse {
  count: number
  next: string | null
  previous: string | null
  results: Item[]
}

export interface ItemFormValues {
  code: string
  name: string
  description: string
  item_class: ItemClass
  product_type: number | null
  material_type: number | null
  shape: number | null
  length: number | null
  breadth: number | null
  height: number | null
  length_uom: DimensionUOM | null
  breadth_uom: DimensionUOM | null
  height_uom: DimensionUOM | null
  inventory_uom: number | null
  purchasable: boolean
  manufacturable: boolean
  stockable: boolean
  sellable: boolean
  lot_tracking: LotTracking
  is_active: boolean
}

export interface ProductType {
  id: number
  name: string
  short_code: string
  applicable_item_classes: ItemClass[]
  is_active: boolean
}

export interface ProductTypeListResponse {
  count: number
  next: string | null
  previous: string | null
  results: ProductType[]
}

// No `applicable_item_classes` here — it's read-only on the API (see
// `ProductTypeSerializer`), maintained by developers via data migrations,
// not something this form collects or submits.
export interface ProductTypeFormValues {
  name: string
  short_code: string
  is_active: boolean
}

/** Whether a class-scoped master-data row (Product Type, Material Type)
 * should be offered when creating/editing an Item of the given class — an
 * empty `applicable_item_classes` means "no restriction, offered
 * everywhere" (the default for rows created before this field existed),
 * so nothing that worked before this field was added stops working.
 * Display filtering only — the API still accepts any active row
 * regardless of class. */
export function isApplicableToClass(
  entry: { applicable_item_classes: ItemClass[] },
  itemClass: ItemClass,
): boolean {
  return entry.applicable_item_classes.length === 0 || entry.applicable_item_classes.includes(itemClass)
}

/** Human-readable label for an `ItemClass` code — for rendering an
 * `applicable_item_classes` list (e.g. on Product Type/Material Type list
 * pages) without re-deriving it from `ITEM_CLASS_OPTIONS` at every call
 * site. */
export const ITEM_CLASS_LABELS: Record<ItemClass, string> = Object.fromEntries(
  ITEM_CLASS_OPTIONS.map((option) => [option.value, option.label]),
) as Record<ItemClass, string>

export interface MaterialType {
  id: number
  name: string
  short_code: string
  applicable_item_classes: ItemClass[]
  is_active: boolean
}

export interface MaterialTypeListResponse {
  count: number
  next: string | null
  previous: string | null
  results: MaterialType[]
}

// No `applicable_item_classes` here — same reason as
// `ProductTypeFormValues` above (read-only on the API).
export interface MaterialTypeFormValues {
  name: string
  short_code: string
  is_active: boolean
}

export interface Shape {
  id: number
  name: string
  short_code: string
  is_active: boolean
}

export interface ShapeListResponse {
  count: number
  next: string | null
  previous: string | null
  results: Shape[]
}

export interface ShapeFormValues {
  name: string
  short_code: string
  is_active: boolean
}

export interface UOM {
  id: number
  code: string
  name: string
  decimal_scale: number
  is_active: boolean
}

export interface UOMListResponse {
  count: number
  next: string | null
  previous: string | null
  results: UOM[]
}

export interface UOMFormValues {
  code: string
  name: string
  decimal_scale: number
  is_active: boolean
}

export interface NamingTemplate {
  id: number
  item_class: ItemClass
  product_type: number | null
  product_type_name: string
  shape: number | null
  shape_name: string
  name_pattern: string
  code_pattern: string
  is_active: boolean
}

export interface NamingTemplateListResponse {
  count: number
  next: string | null
  previous: string | null
  results: NamingTemplate[]
}

export interface NamingTemplateFormValues {
  item_class: ItemClass
  product_type: number | null
  shape: number | null
  name_pattern: string
  code_pattern: string
  is_active: boolean
}
