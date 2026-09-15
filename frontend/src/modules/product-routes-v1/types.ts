export type RouteVersionStatusV1 = 'DRAFT' | 'ACTIVE' | 'ARCHIVED'

/** One resolved output/input row on a route step's underlying process —
 * used by the Output Routing and Item Mappings steps. Read-only,
 * server-computed from whichever process version the node resolves to. */
export interface RouteNodeOutputV1 {
  id: number
  item_group: number
  item_group_name: string
  classification: number | null
  classification_name: string
}

export interface RouteNodeInputV1 {
  id: number
  item_group: number
  item_group_name: string
}

/** One step on a route version, as returned by the API. */
export interface RouteNodeV1 {
  id: number
  node_key: string
  process_definition: number
  process_definition_name: string
  display_label: string
  sequence_hint: number
  is_optional: boolean
  outputs: RouteNodeOutputV1[]
  inputs: RouteNodeInputV1[]
}

export interface RouteNodeV1FormValues {
  id?: number
  node_key?: string
  process_definition: number
  display_label: string
  is_optional: boolean
}

export type RouteEdgeDispositionV1 = 'CONTINUE_TO_PROCESS' | 'MOVE_TO_STORAGE'

export interface RouteEdgeV1 {
  id: number
  source_node: number
  source_output_definition: number | null
  target_node: number | null
  disposition_type: RouteEdgeDispositionV1
  destination_location: number | null
  destination_location_name: string
}

export interface RouteEdgeV1FormValues {
  id?: number
  source_node: number
  source_output_definition: number | null
  target_node: number | null
  disposition_type: RouteEdgeDispositionV1
  destination_location: number | null
}

/** One row of the resolver data — "for this target SKU, this node's role
 * resolves to this concrete item." Exactly one of `input_definition`/
 * `output_definition` is set. */
export interface RouteItemMappingV1 {
  id: number
  node: number
  input_definition: number | null
  output_definition: number | null
  target_item: number
  target_item_name: string
  resolved_item: number
  resolved_item_name: string
}

export interface RouteItemMappingV1FormValues {
  id?: number
  node: number
  input_definition: number | null
  output_definition: number | null
  target_item: number
  resolved_item: number
}

export interface ProcessRouteVersionV1 {
  id: number
  version_number: number
  status: RouteVersionStatusV1
  is_default: boolean
  effective_from: string | null
  effective_to: string | null
  item_group: number
  item_group_name: string
  route_name: string
  nodes: RouteNodeV1[]
  edges: RouteEdgeV1[]
  item_mappings: RouteItemMappingV1[]
}

/** The flat, wizard-facing shape of a route — mirrors `ProcessRoute` in
 * `modules/product-routes/types.ts`, scoped to an Item Group instead of a
 * single Item. */
export interface ProcessRouteV1 {
  id: number
  name: string
  is_active: boolean
  version_id: number
  version_number: number
  version_status: RouteVersionStatusV1
  is_default: boolean
  effective_from: string | null
  effective_to: string | null
  item_group: number
  item_group_name: string
  nodes: RouteNodeV1[]
  edges: RouteEdgeV1[]
  item_mappings: RouteItemMappingV1[]
}

export interface ProcessRouteV1ListResponse {
  count: number
  next: string | null
  previous: string | null
  results: ProcessRouteV1[]
}

export interface RouteBasicsV1Values {
  name: string
  item_group: number
  is_default: boolean
  effective_from: string | null
}

export const PRODUCT_ROUTE_V1_WIZARD_STEPS = [
  { key: 'basics', label: 'Basics' },
  { key: 'steps', label: 'Steps' },
  { key: 'output_routing', label: 'Output Routing' },
  { key: 'item_mappings', label: 'Item Mappings' },
  { key: 'review', label: 'Review' },
] as const

export type ProductRouteV1WizardStepKey = (typeof PRODUCT_ROUTE_V1_WIZARD_STEPS)[number]['key']
