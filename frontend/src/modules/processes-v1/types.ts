export type VersionStatusV1 = 'DRAFT' | 'ACTIVE' | 'ARCHIVED'

/** One configured Input slot, as returned by the API — matched by Item
 * Group (a free-form, admin-curated "items interchangeable at this
 * role/stage" tag), not a pinned specific Item. */
export interface ProcessInputV1 {
  id: number
  sequence: number
  item_group: number
  item_group_name: string
  uom: string
  is_required: boolean
}

export interface ProcessInputV1FormValues {
  id?: number
  item_group: number
  uom: string
  is_required: boolean
}

/** One configured Output slot. `classification` is optional — kept
 * alongside `item_group`, not replaced by it: `item_group` is the precise
 * match key per family/stage/grade; `classification` stays as the
 * standardized cross-cutting vocabulary (Good/Standard/Reject/...) for
 * reporting that spans multiple Item Groups. */
export interface ProcessOutputV1 {
  id: number
  sequence: number
  item_group: number
  item_group_name: string
  classification: number | null
  classification_name: string
  uom: string
  can_move_forward: boolean
  creates_traceable_output: boolean
}

export interface ProcessOutputV1FormValues {
  id?: number
  item_group: number
  classification: number | null
  uom: string
  can_move_forward: boolean
  creates_traceable_output: boolean
}

export interface ProcessV1 {
  id: number
  name: string
  code: string
  is_active: boolean
  version_id: number
  version_number: number
  version_status: VersionStatusV1
  category: number
  category_name: string
  description: string
  inputs: ProcessInputV1[]
  outputs: ProcessOutputV1[]
}

export interface ProcessV1ListResponse {
  count: number
  next: string | null
  previous: string | null
  results: ProcessV1[]
}

export interface ProcessV1BasicsValues {
  name: string
  code: string
  category: number
  description: string
}

export interface ActivationResultV1 {
  version_status: VersionStatusV1
}

export const PROCESS_V1_WIZARD_STEPS = [
  { key: 'basics', label: 'Basics' },
  { key: 'inputs', label: 'Inputs' },
  { key: 'outputs', label: 'Outputs' },
  { key: 'review', label: 'Review' },
] as const

export type ProcessV1WizardStepKey = (typeof PROCESS_V1_WIZARD_STEPS)[number]['key']
