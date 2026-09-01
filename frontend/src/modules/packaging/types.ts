export type PackagingProfileScope = 'STANDARD' | 'CUSTOMER_TEMPLATE'

export const PACKAGING_PROFILE_SCOPE_OPTIONS: { value: PackagingProfileScope; label: string }[] = [
  { value: 'STANDARD', label: 'Standard' },
  { value: 'CUSTOMER_TEMPLATE', label: 'Customer Template' },
]

export type PackagingVersionStatus = 'DRAFT' | 'PUBLISHED' | 'RETIRED'

export type PackMode = 'PIECE' | 'POUCH' | 'CARTON' | 'OTHER'

export const PACK_MODE_OPTIONS: { value: PackMode; label: string }[] = [
  { value: 'PIECE', label: 'Piece' },
  { value: 'POUCH', label: 'Pouch' },
  { value: 'CARTON', label: 'Carton' },
  { value: 'OTHER', label: 'Other' },
]

export type PackagingMaterialLevel = 'POUCH' | 'CARTON' | 'PALLET' | 'OTHER'

export const PACKAGING_MATERIAL_LEVEL_OPTIONS: { value: PackagingMaterialLevel; label: string }[] = [
  { value: 'POUCH', label: 'Pouch' },
  { value: 'CARTON', label: 'Carton' },
  { value: 'PALLET', label: 'Pallet' },
  { value: 'OTHER', label: 'Other' },
]

export interface PackagingProfileMaterial {
  id: number
  item: number
  item_name: string
  item_code: string
  level: PackagingMaterialLevel
  quantity: string
  uom: number
  uom_code: string
}

export interface PackagingProfileVersion {
  id: number
  profile: number
  profile_name: string
  version_number: number
  status: PackagingVersionStatus
  effective_from: string | null
  effective_to: string | null
  selling_uom: number | null
  selling_uom_code: string
  pack_mode: PackMode
  pieces_per_pouch: number | null
  pouches_per_carton: number | null
  carton_length_mm: string | null
  carton_breadth_mm: string | null
  carton_height_mm: string | null
  carton_net_weight_kg: string | null
  carton_gross_weight_kg: string | null
  pieces_per_selling_unit: number | null
  cbm: string | null
  materials: PackagingProfileMaterial[]
}

export interface PackagingProfile {
  id: number
  code: string
  name: string
  finished_item: number
  finished_item_name: string
  scope: PackagingProfileScope
  is_active: boolean
  current_version: PackagingProfileVersion | null
}

export interface PackagingProfileListResponse {
  count: number
  next: string | null
  previous: string | null
  results: PackagingProfile[]
}

// Reverse view of `PackagingProfileMaterial` from a Packaging Material
// item's side — one row per profile version that lists this item as a
// material. Backs the Item form's "Used In Packaging Profiles" card.
export interface PackagingProfileMaterialUsage {
  id: number
  profile_id: number
  profile_name: string
  profile_code: string
  finished_item_name: string
  version_number: number
  version_status: PackagingVersionStatus
  pieces_per_selling_unit: number | null
  level: PackagingMaterialLevel
  quantity: string
  uom_code: string
}

export interface PackagingProfileMaterialUsageListResponse {
  count: number
  next: string | null
  previous: string | null
  results: PackagingProfileMaterialUsage[]
}

export interface PackagingProfileFormValues {
  code: string
  name: string
  finished_item: number
  scope: PackagingProfileScope
  is_active: boolean
}

export interface PackagingProfileVersionFormValues {
  effective_from: string | null
  effective_to: string | null
  selling_uom: number | null
  pack_mode: PackMode
  pieces_per_pouch: number | null
  pouches_per_carton: number | null
  carton_length_mm: number | null
  carton_breadth_mm: number | null
  carton_height_mm: number | null
  carton_net_weight_kg: number | null
  carton_gross_weight_kg: number | null
}

export interface PackagingMaterialRow {
  id?: number
  item: number
  level: PackagingMaterialLevel
  quantity: number
  uom: number
}
