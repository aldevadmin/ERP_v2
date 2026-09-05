import type { WorkCentrePosition } from '../tooling/types'

/** A configurable lookup for `WorkCentre.type` (e.g. Machine, Station) —
 * managed from Settings, not a fixed enum. */
export interface WorkCentreType {
  id: number
  name: string
  is_active: boolean
}

export interface WorkCentreTypeListResponse {
  count: number
  next: string | null
  previous: string | null
  results: WorkCentreType[]
}

export interface WorkCentreTypeFormValues {
  name: string
  is_active: boolean
}

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

/** A planning/location grouping of Work Centres (e.g. "Bay 1") — used by
 * the Packing module's weekly planner. Not itself an execution resource;
 * see `WorkCentre.bay`. */
export interface Bay {
  id: number
  name: string
  code: string
  is_active: boolean
}

export interface BayListResponse {
  count: number
  next: string | null
  previous: string | null
  results: Bay[]
}

export interface BayFormValues {
  name: string
  code: string
  is_active: boolean
}

export interface WorkCentre {
  id: number
  name: string
  code: string
  type: number
  type_name: string
  bay: number | null
  bay_name: string | null
  is_active: boolean
  capabilities: WorkCentreCapability[]
  capabilities_count: number
  positions: WorkCentrePosition[]
  positions_count: number
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
  type: number
  bay: number | null
  is_active: boolean
}
