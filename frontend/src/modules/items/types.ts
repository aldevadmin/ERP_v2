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

export type LotTracking = 'NONE' | 'OPTIONAL' | 'REQUIRED'

export const LOT_TRACKING_OPTIONS: { value: LotTracking; label: string }[] = [
  { value: 'NONE', label: 'None' },
  { value: 'OPTIONAL', label: 'Optional' },
  { value: 'REQUIRED', label: 'Required' },
]

/** Which of Product Type / Material Type is required or hidden, per item
 * class — mirrors the backend's `_REQUIRED_FIELDS_BY_CLASS`/
 * `_HIDDEN_FIELDS_BY_CLASS` in `apps/items/serializers.py` exactly, so the
 * form only ever shows what the server will actually accept. The server
 * re-validates independently either way. */
export const REQUIRED_FIELDS_BY_CLASS: Record<ItemClass, ('product_type' | 'material_type' | 'inventory_uom')[]> = {
  RAW_MATERIAL: ['material_type', 'inventory_uom'],
  WIP: ['product_type', 'material_type', 'inventory_uom'],
  FINISHED_GOOD: ['product_type', 'material_type', 'inventory_uom'],
  PACKAGING_MATERIAL: ['product_type', 'material_type', 'inventory_uom'],
  CONSUMABLE: ['inventory_uom'],
  SCRAP_BY_PRODUCT: ['inventory_uom'],
}

export const HIDDEN_FIELDS_BY_CLASS: Record<ItemClass, ('product_type' | 'material_type')[]> = {
  RAW_MATERIAL: ['product_type'],
  WIP: [],
  FINISHED_GOOD: [],
  PACKAGING_MATERIAL: [],
  CONSUMABLE: [],
  SCRAP_BY_PRODUCT: [],
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
  is_active: boolean
}

export interface ProductTypeListResponse {
  count: number
  next: string | null
  previous: string | null
  results: ProductType[]
}

export interface ProductTypeFormValues {
  name: string
  is_active: boolean
}

export interface MaterialType {
  id: number
  name: string
  is_active: boolean
}

export interface MaterialTypeListResponse {
  count: number
  next: string | null
  previous: string | null
  results: MaterialType[]
}

export interface MaterialTypeFormValues {
  name: string
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
