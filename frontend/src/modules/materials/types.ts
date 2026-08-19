export interface Material {
  id: number
  code: string
  name: string
  unit: string
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
  is_active: boolean
}
