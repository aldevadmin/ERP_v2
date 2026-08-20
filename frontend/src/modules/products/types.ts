export type ProductStage = 'SEMI_FINISHED' | 'FINISHED_GOOD'

export const PRODUCT_STAGE_OPTIONS: { value: ProductStage; label: string }[] = [
  { value: 'SEMI_FINISHED', label: 'Semi-Finished' },
  { value: 'FINISHED_GOOD', label: 'Finished Good' },
]

export interface Product {
  id: number
  sku_code: string
  name: string
  description: string
  base_unit: string
  stage: ProductStage
  is_active: boolean
}

export interface ProductListResponse {
  count: number
  next: string | null
  previous: string | null
  results: Product[]
}

export interface ProductFormValues {
  sku_code: string
  name: string
  description: string
  base_unit: string
  stage: ProductStage
  is_active: boolean
}

export type CartonPlyRating = '3_PLY' | '5_PLY'

export const CARTON_PLY_RATING_OPTIONS: { value: CartonPlyRating; label: string }[] = [
  { value: '3_PLY', label: '3-ply' },
  { value: '5_PLY', label: '5-ply' },
]

export type CustomerSKUMappingFileCategory =
  | 'PLATE_IMAGE'
  | 'POUCH_IMAGE'
  | 'DESIGN_FILE'
  | 'RETAIL_STICKER_IMAGE'

export interface CustomerSKUMappingFile {
  id: number
  category: CustomerSKUMappingFileCategory
  file: string
  created_at: string
}

export interface CustomerSKUMappingFileListResponse {
  count: number
  next: string | null
  previous: string | null
  results: CustomerSKUMappingFile[]
}

export interface CustomerSKUMapping {
  id: number
  customer: number
  customer_name: string
  customer_sku_code: string
  customer_description: string
  product: number
  product_sku_code: string
  product_name: string
  pieces_per_pouch: number | null
  pouches_per_carton: number | null
  pieces_per_carton: number | null
  pouch_height_inches: number | null
  carton_ply_rating: CartonPlyRating | ''
  carton_length_mm: number | null
  carton_breadth_mm: number | null
  carton_height_mm: number | null
  carton_net_weight_kg: number | null
  carton_gross_weight_kg: number | null
  pouch_thickness_microns: number | null
  pouch_length_mm: number | null
  pouch_breadth_mm: number | null
  pouch_height_mm: number | null
  has_retail_sticker: boolean | null
  retail_sticker_comments: string
  has_silica_gel: boolean | null
  other_packing_requirements: string
  files: CustomerSKUMappingFile[]
}

export interface CustomerSKUMappingListResponse {
  count: number
  next: string | null
  previous: string | null
  results: CustomerSKUMapping[]
}

export interface CustomerSKUMappingFormValues {
  customer: number
  customer_sku_code: string
  customer_description: string
  product: number
  pieces_per_pouch: number | null
  pouches_per_carton: number | null
  pouch_height_inches: number | null
  carton_ply_rating: CartonPlyRating | ''
  carton_length_mm: number | null
  carton_breadth_mm: number | null
  carton_height_mm: number | null
  carton_net_weight_kg: number | null
  carton_gross_weight_kg: number | null
  pouch_thickness_microns: number | null
  pouch_length_mm: number | null
  pouch_breadth_mm: number | null
  pouch_height_mm: number | null
  has_retail_sticker: boolean | null
  retail_sticker_comments: string
  has_silica_gel: boolean | null
  other_packing_requirements: string
}
