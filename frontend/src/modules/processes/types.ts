export interface ProcessCategory {
  id: number
  name: string
  is_active: boolean
}

export interface ProcessCategoryListResponse {
  count: number
  next: string | null
  previous: string | null
  results: ProcessCategory[]
}

export interface ProcessCategoryFormValues {
  name: string
  is_active: boolean
}

export type ResourceType = 'STATION' | 'MACHINE' | 'LOCATION'

export const RESOURCE_TYPE_OPTIONS: { value: ResourceType; label: string }[] = [
  { value: 'STATION', label: 'Station' },
  { value: 'MACHINE', label: 'Machine' },
  { value: 'LOCATION', label: 'Location' },
]

export interface Process {
  id: number
  name: string
  category: number
  category_name: string
  resource_type: ResourceType
  inputs: number[]
  outputs: number[]
  description: string
  is_active: boolean
}

export interface ProcessListResponse {
  count: number
  next: string | null
  previous: string | null
  results: Process[]
}

export interface ProcessFormValues {
  name: string
  category: number
  resource_type: ResourceType
  inputs: number[]
  outputs: number[]
  description: string
  is_active: boolean
}
