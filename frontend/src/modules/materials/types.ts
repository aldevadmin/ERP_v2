export type MaterialCategory = 'RAW_MATERIAL' | 'PACKAGING'

export const MATERIAL_CATEGORY_OPTIONS: { value: MaterialCategory; label: string }[] = [
  { value: 'RAW_MATERIAL', label: 'Raw Material' },
  { value: 'PACKAGING', label: 'Packaging' },
]

export interface Material {
  id: number
  code: string
  name: string
  unit: string
  category: MaterialCategory
  is_active: boolean
}

export interface MaterialListResponse {
  count: number
  next: string | null
  previous: string | null
  results: Material[]
}

export interface MaterialFormValues {
  code: string
  name: string
  unit: string
  category: MaterialCategory
  is_active: boolean
}
