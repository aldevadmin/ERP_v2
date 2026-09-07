export interface Shift {
  id: number
  name: string
  code: string
  start_time: string | null
  end_time: string | null
  is_active: boolean
}

export type PackingDemandStatus = 'UNPLANNED' | 'PLANNED' | 'PART_PACKED' | 'COMPLETE'

export interface PackingDemandRow {
  export_order_line_id: number
  order_no: string
  customer_name: string
  line_number: number
  item_name: string
  item_code: string
  customer_sku_code: string
  required_qty: number
  packable_qty: number
  packed_qty: number
  balance_qty: number
  planned_qty: number
  unplanned_qty: number
  packing_due_date: string | null
  status: PackingDemandStatus
  has_plan: boolean
}

export interface PackingDemandListResponse {
  count: number
  results: PackingDemandRow[]
}

export type PackingPlanLineStatus = 'DRAFT' | 'PLANNED' | 'RELEASED' | 'CANCELLED'

export interface PackingPlanLine {
  id: number
  export_order_line: number
  order_no: string
  item_name: string
  date: string
  shift: number
  shift_name: string
  bay: number
  bay_name: string
  planned_qty: number
  status: PackingPlanLineStatus
  remarks: string
  has_job: boolean
}

export interface PackingPlanLineFormValues {
  export_order_line: number
  date: string
  shift: number
  bay: number
  planned_qty: number
  remarks?: string
}

export type PackingJobStatus =
  | 'AWAITING_MATERIAL'
  | 'READY'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'ON_HOLD'
  | 'CANCELLED'

export interface PackingJob {
  id: number
  job_number: string
  plan_line: number
  order_no: string
  customer_name: string
  item_name: string
  date: string
  shift_name: string
  bay: number
  bay_name: string
  target_qty: number
  status: PackingJobStatus
  packed_qty: number
  standard_qty: number
  reject_qty: number
  balance_qty: number
  allocated_qty: number
  remarks: string
}

export interface PackingMaterialRequirementRow {
  item: number
  item_label: string
  required_qty: number
  uom_code: string
}

export type MaterialRequestLineStatus =
  | 'DRAFT'
  | 'REQUESTED'
  | 'PART_ISSUED'
  | 'ISSUED'
  | 'PART_RECEIVED'
  | 'RECEIVED'
  | 'CANCELLED'

export interface PackingMaterialMovement {
  id: number
  date: string
  quantity_issued: number
  quantity_received: number
  remarks: string
  created_at: string
}

export interface PackingMaterialRequestLine {
  id: number
  item: number
  item_name: string
  item_code: string
  uom: string
  required_qty: number
  requested_qty: number
  issued_qty: number
  received_qty: number
  balance_qty: number
  status: MaterialRequestLineStatus
  movements: PackingMaterialMovement[]
}

export interface PackingMaterialRequest {
  id: number
  job: number
  source_location: number | null
  source_location_name: string | null
  required_by: string | null
  remarks: string
  status: MaterialRequestLineStatus
  lines: PackingMaterialRequestLine[]
}

export interface PackingMaterialRequestFormValues {
  job: number
  source_location?: number | null
  required_by?: string | null
  remarks?: string
  lines_write: { item: number; uom: string; required_qty: number; requested_qty: number }[]
}

export interface ReceiveMaterialLine {
  request_line: number
  date?: string
  quantity_issued?: number
  quantity_received?: number
  remarks?: string
}

export type AllocationStatus = 'PLANNED' | 'READY' | 'RUNNING' | 'COMPLETED' | 'ON_HOLD' | 'CANCELLED'

export interface PackingAllocationOperator {
  id: number
  employee: number
  employee_name: string
}

export type WorkSessionStatus = 'DRAFT' | 'RUNNING' | 'COMPLETED'

export interface ProcessExecutionOutputRow {
  id: number
  output_definition: number
  item_label: string
  classification_name: string
  quantity: number
}

export interface ProcessExecutionInputRow {
  id: number
  input_definition: number
  item_label: string
  quantity: number
}

export interface ProcessExecutionDetail {
  id: number
  process_version: number
  process_definition_name: string
  work_centre: number | null
  work_centre_name: string | null
  export_order_line: number | null
  date: string
  batch_lot_number: string
  employees: number[]
  employee_names: string[]
  remarks: string
  inputs: ProcessExecutionInputRow[]
  outputs: ProcessExecutionOutputRow[]
  total_input_quantity: number
  total_output_quantity: number
  created_at: string
}

export interface PackingWorkSession {
  id: number
  allocation: number
  execution: number | null
  execution_detail: ProcessExecutionDetail | null
  status: WorkSessionStatus
  started_at: string | null
  completed_at: string | null
  remarks: string
}

export interface PackingWorkCentreAllocation {
  id: number
  job: number
  work_centre: number
  work_centre_name: string
  work_centre_code: string
  date: string
  shift: number
  shift_name: string
  sequence: number
  assigned_qty: number
  status: AllocationStatus
  operators: PackingAllocationOperator[]
  packed_qty: number
  balance_qty: number
  sessions: PackingWorkSession[]
}

export interface PackingAllocationFormValues {
  job: number
  work_centre: number
  // date/shift/sequence are derived server-side from the job's plan line
  // and existing allocations when creating via
  // `POST /packing-jobs/{id}/allocations/` — only required for a direct
  // PATCH against `/packing-allocations/{id}/`.
  date?: string
  shift?: number
  sequence?: number
  assigned_qty: number
  operator_ids?: number[]
}

export interface AutoAllocationRow {
  work_centre: number
  date: string
  shift: number
  sequence: number
  assigned_qty: number
}

export interface TodaysWorkRow {
  allocation_id: number
  job_id: number
  job_number: string
  order_no: string
  item_name: string
  bay_id: number
  bay_name: string
  work_centre_id: number
  work_centre_name: string
  sequence: number
  assigned_qty: number
  packed_qty: number
  status: AllocationStatus
}

// Rendered output-classification quantities keyed by the
// ProcessOutputDefinition id — the Packing Entry screen builds this
// dynamically from whatever the active process version's outputs are,
// rather than hardcoding Good/Standard/Reject fields.
export interface ExecutionOutputInput {
  output_definition: number
  classification_name: string
  item_label: string
  quantity: number | null
}
