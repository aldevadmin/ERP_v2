export type RouteVersionStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED'

export interface StorageLocation {
  id: number
  name: string
  is_active: boolean
}

export interface StorageLocationListResponse {
  count: number
  next: string | null
  previous: string | null
  results: StorageLocation[]
}

export interface StorageLocationFormValues {
  name: string
  is_active: boolean
}

/** One resolved output row on a route step's underlying process — used by
 * the Output Routing step to know which dispositions it needs. Read-only,
 * server-computed from whichever process version the node resolves to. */
export interface RouteNodeOutput {
  id: number
  item_label: string
  classification: number
  classification_name: string
}

/** One step on a route version, as returned by the API. `node_key` is
 * server-generated (slugified from the process name) — never entered by
 * hand, matching the Add Step modal, which has no "key" field. */
export interface RouteNode {
  id: number
  node_key: string
  process_definition: number
  process_definition_name: string
  display_label: string
  sequence_hint: number
  is_optional: boolean
  outputs: RouteNodeOutput[]
}

/** What the Steps editor writes — `node_key` is optional; the server
 * auto-generates and dedupes it when omitted. */
export interface RouteNodeFormValues {
  id?: number
  node_key?: string
  process_definition: number
  display_label: string
  is_optional: boolean
}

export type RouteEdgeDisposition = 'CONTINUE_TO_PROCESS' | 'MOVE_TO_STORAGE'

/** One connection between route steps, or a terminal disposition for one
 * of a branching step's outputs, as returned by the API. */
export interface RouteEdge {
  id: number
  source_node: number
  source_output_definition: number | null
  target_node: number | null
  disposition_type: RouteEdgeDisposition
  destination_location: number | null
  destination_location_name: string
}

/** What the Output Routing editor writes. */
export interface RouteEdgeFormValues {
  id?: number
  source_node: number
  source_output_definition: number | null
  target_node: number | null
  disposition_type: RouteEdgeDisposition
  destination_location: number | null
}

/** One versioned configuration snapshot of a ProcessRoute, as returned by
 * the API. */
export interface ProcessRouteVersion {
  id: number
  version_number: number
  status: RouteVersionStatus
  is_default: boolean
  effective_from: string | null
  effective_to: string | null
  product: number
  product_name: string
  route_name: string
  nodes: RouteNode[]
  edges: RouteEdge[]
}

/** The flat, wizard-facing shape of a route — mirrors how `Process`
 * flattens `ProcessDefinition` + its current version in the processes
 * module (see `frontend/src/modules/processes/api.ts`). */
export interface ProcessRoute {
  id: number
  name: string
  is_active: boolean
  version_id: number
  version_number: number
  version_status: RouteVersionStatus
  is_default: boolean
  effective_from: string | null
  effective_to: string | null
  product: number
  product_name: string
  nodes: RouteNode[]
  edges: RouteEdge[]
}

export interface ProcessRouteListResponse {
  count: number
  next: string | null
  previous: string | null
  results: ProcessRoute[]
}

/** What the Basics step alone collects and saves. */
export interface RouteBasicsValues {
  name: string
  product: number
  is_default: boolean
  effective_from: string | null
}

export const PRODUCT_ROUTE_WIZARD_STEPS = [
  { key: 'basics', label: 'Basics' },
  { key: 'steps', label: 'Steps' },
  { key: 'output_routing', label: 'Output Routing' },
  { key: 'review', label: 'Review' },
] as const

export type ProductRouteWizardStepKey = (typeof PRODUCT_ROUTE_WIZARD_STEPS)[number]['key']
