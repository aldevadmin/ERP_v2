/** A configurable lookup for `Tooling.tooling_type` (e.g. Mould, Die, Jig)
 * — managed from Settings, not a fixed enum. */
export interface ToolingType {
  id: number
  name: string
  is_active: boolean
}

export interface ToolingTypeListResponse {
  count: number
  next: string | null
  previous: string | null
  results: ToolingType[]
}

export interface ToolingTypeFormValues {
  name: string
  is_active: boolean
}

/** One item this tooling is usable for — optionally narrowed to a specific
 * process. Advisory for frontend filtering; the backend validates it too. */
export interface ToolingCompatibility {
  id: number
  product: number
  product_name: string
  product_sku_code: string
  process_definition: number | null
  process_definition_name: string
}

export interface ToolingCompatibilityFormValues {
  id?: number
  product: number
  process_definition: number | null
}

export interface Tooling {
  id: number
  code: string
  name: string
  tooling_type: number
  tooling_type_name: string
  cavity_count: number | null
  default_standard_rate: number | null
  is_active: boolean
  notes: string
  compatibilities: ToolingCompatibility[]
  compatibilities_count: number
}

export interface ToolingListResponse {
  count: number
  next: string | null
  previous: string | null
  results: Tooling[]
}

export interface ToolingFormValues {
  code: string
  name: string
  tooling_type: number
  cavity_count: number | null
  default_standard_rate: number | null
  is_active: boolean
  notes: string
}

/** One physical, addressable position on a Work Centre — exists
 * independently of any Process. `installed_tooling*`/`default_sku`/
 * `standard_rate` reflect the position's currently active assignment, if
 * any (read-only, server-computed). */
export interface WorkCentrePosition {
  id: number
  position_index: number
  display_label: string
  is_active: boolean
  installed_tooling: string
  installed_tooling_code: string
  default_sku: string
  standard_rate: string
}

export interface WorkCentrePositionFormValues {
  id?: number
  display_label: string
  is_active: boolean
}

export interface ToolingAssignment {
  id: number
  tooling: number
  tooling_name: string
  tooling_code: string
  work_centre_position: number
  work_centre_name: string
  position_index: number
  default_item: number | null
  default_item_label: string
  standard_rate_override: number | null
  effective_from: string
  effective_to: string | null
  notes: string
}

export interface ToolingAssignmentFormValues {
  tooling: number
  default_item: number | null
  standard_rate_override: number | null
  effective_from: string
  notes: string
}
