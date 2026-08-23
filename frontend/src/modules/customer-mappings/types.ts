export type MappingVersionStatus = 'DRAFT' | 'PUBLISHED' | 'RETIRED'

export type RequirementCategory = 'LABEL' | 'DOCUMENT' | 'QUALITY' | 'PALLET' | 'COMPLIANCE' | 'OTHER'

export const REQUIREMENT_CATEGORY_OPTIONS: { value: RequirementCategory; label: string }[] = [
  { value: 'LABEL', label: 'Label' },
  { value: 'DOCUMENT', label: 'Document' },
  { value: 'QUALITY', label: 'Quality' },
  { value: 'PALLET', label: 'Pallet' },
  { value: 'COMPLIANCE', label: 'Compliance' },
  { value: 'OTHER', label: 'Other' },
]

export type MappingFileCategory = 'PLATE_IMAGE' | 'POUCH_IMAGE' | 'DESIGN_FILE' | 'RETAIL_STICKER_IMAGE'

export interface MappingRequirement {
  id: number
  category: RequirementCategory
  key: string
  value: string
  is_required: boolean
  sort_order: number
}

export interface MappingRequirementRow {
  id?: number
  category: RequirementCategory
  key: string
  value: string
  is_required: boolean
  sort_order: number
}

export interface MappingFile {
  id: number
  category: MappingFileCategory
  file: string
  created_at: string
}

export interface CustomerProductMappingVersion {
  id: number
  mapping: number
  mapping_code: string
  customer_name: string
  item_name: string
  item_code: string
  version_number: number
  status: MappingVersionStatus
  effective_from: string | null
  effective_to: string | null
  customer_sku: string
  customer_description: string
  packaging_profile_version: number | null
  packaging_profile_name: string
  packaging_profile_version_number: number | null
  selling_uom: number | null
  selling_uom_code: string
  unit_price: string | null
  currency: string
  barcode: string
  requirements: MappingRequirement[]
  files: MappingFile[]
}

export interface CustomerProductMapping {
  id: number
  customer: number
  customer_name: string
  item: number
  item_name: string
  item_code: string
  customer_sku: string
  mapping_code: string
  is_active: boolean
  current_version: CustomerProductMappingVersion | null
}

export interface CustomerProductMappingListResponse {
  count: number
  next: string | null
  previous: string | null
  results: CustomerProductMapping[]
}

export interface CustomerProductMappingFormValues {
  customer: number
  item: number
  customer_sku: string
  mapping_code: string
  is_active: boolean
}

export interface CustomerProductMappingVersionFormValues {
  effective_from: string | null
  effective_to: string | null
  customer_description: string
  packaging_profile_version: number | null
  selling_uom: number | null
  unit_price: number | null
  currency: string
  barcode: string
}
