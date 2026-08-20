export type WorkCentreType = 'MACHINE' | 'STATION'

export const WORK_CENTRE_TYPE_OPTIONS: { value: WorkCentreType; label: string }[] = [
  { value: 'MACHINE', label: 'Machine' },
  { value: 'STATION', label: 'Station' },
]

/** One process this work centre is capable of running — the "capability
 * mapping" the Process wizard's Step 4 refers to but never edits directly
 * (it's configured here instead). `standard_rate` is optional: a
 * capability can exist before its rate is known. */
export interface WorkCentreCapability {
  id: number
  process_definition: number
  process_name: string
  process_code: string
  standard_rate: number | null
}

export interface WorkCentreCapabilityFormValues {
  id?: number
  process_definition: number
  standard_rate: number | null
}

export interface WorkCentre {
  id: number
  name: string
  code: string
  type: WorkCentreType
  is_active: boolean
  capabilities: WorkCentreCapability[]
  capabilities_count: number
}

export interface WorkCentreListResponse {
  count: number
  next: string | null
  previous: string | null
  results: WorkCentre[]
}

export interface WorkCentreFormValues {
  name: string
  code: string
  type: WorkCentreType
  is_active: boolean
}
