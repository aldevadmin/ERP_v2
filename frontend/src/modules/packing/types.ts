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
  plan_code: string
  export_order_line: number
  order_no: string
  customer_name: string
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
  job_id: number | null
  job_number: string | null
  job_status: PackingJobStatus | null
  job_target_qty: number | null
  job_packed_qty: number | null
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
  plan_code: string
  order_no: string
  customer_name: string
  item_name: string
  date: string
  shift: number
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

// --- v2 execution model: PackingShift -> WorkCentreSession -> SKU
// Allocation -> PackingIntervalRecord. Replaces v1's job-anchored
// allocation + one-shot PackingWorkSession.

export type AllocationStatus = 'PLANNED' | 'READY' | 'RUNNING' | 'COMPLETED' | 'ON_HOLD' | 'CANCELLED'
export type PackingShiftStatus = 'NOT_STARTED' | 'RUNNING' | 'STOPPED'
export type WorkCentreSessionStatus = 'RUNNING' | 'IDLE' | 'ISSUE' | 'STOPPED'
export type IntervalRecordStatus = 'EXPECTED' | 'ENTERED' | 'MISSING' | 'LATE_ENTRY' | 'CORRECTED'
export type IssueType = 'MACHINE' | 'MATERIAL' | 'QUALITY' | 'OTHER'

export interface PackingExecutionConfig {
  id: number
  recording_mode: 'INTERVAL_BASED' | 'SHIFT_TOTAL' | 'MANUAL_EVENT' | 'MACHINE_GENERATED'
  default_interval_minutes: number
  auto_create_expected_intervals: boolean
  allow_late_entry: boolean
  missing_record_warning_minutes: number
  plan_calculation: 'STANDARD_RATE' | 'MANUAL'
  allow_partial_interval_on_sku_change: boolean
}

export interface PackingWorkCentreAllocation {
  id: number
  session: number
  job: number
  job_number: string
  order_no: string
  item_name: string
  work_centre_code: string
  process_version: number | null
  sequence: number
  assigned_qty: number
  status: AllocationStatus
  started_at: string | null
  completed_at: string | null
  packed_qty: number
  processed_qty: number
  balance_qty: number
}

export interface PackingWorkCentreSessionOperator {
  id: number
  employee: number
  employee_name: string
}

export interface OpenIssueSummary {
  id: number
  issue_type: IssueType
  description: string
  started_at: string
}

export interface PackingWorkCentreSession {
  id: number
  packing_shift: number
  work_centre: number
  work_centre_code: string
  work_centre_name: string
  bay: number
  bay_name: string
  date: string
  shift_id: number
  shift_name: string
  status: WorkCentreSessionStatus
  started_at: string | null
  stopped_at: string | null
  stop_reason: string
  operators: PackingWorkCentreSessionOperator[]
  allocations: PackingWorkCentreAllocation[]
  current_allocation_id: number | null
  open_issue: OpenIssueSummary | null
}

export interface PackingShift {
  id: number
  date: string
  shift: number
  shift_name: string
  status: PackingShiftStatus
  started_at: string | null
  stopped_at: string | null
  work_centre_sessions: PackingWorkCentreSession[]
}

export interface StartShiftWorkCentreEntry {
  work_centre: number
  operator_ids: number[]
}

export interface PackingIntervalRecord {
  id: number
  allocation: number
  from_time: string
  to_time: string
  scheduled_minutes: number
  downtime_minutes: number
  available_minutes: number
  standard_rate_snapshot: string | null
  planned_output: number
  premium_qty: number
  standard_qty: number
  reject_qty: number
  cleaned_qty: number
  pouches_packed: number
  loose_pieces_packed: number
  pieces_packed: number
  cartons_completed: number
  status: IntervalRecordStatus
  entered_by: number | null
  entered_at: string | null
  is_late_entry: boolean
  remarks: string
  quality_total: number
  yield_percent: number | null
  reject_percent: number | null
  actual_rate: number | null
  packing_rate: number | null
  efficiency_percent: number | null
}

export interface RecordIntervalPayload {
  from_time?: string
  to_time?: string
  premium_qty: number
  standard_qty: number
  reject_qty: number
  cleaned_qty: number
  pouches_packed: number
  loose_pieces_packed: number
  cartons_completed: number
  remarks?: string
}

export interface WorkCentreIssueEvent {
  id: number
  session: number
  allocation: number | null
  issue_type: IssueType
  description: string
  stops_productive_time: boolean
  started_at: string
  resolved_at: string | null
  reported_by: number | null
  resolved_by: number | null
  is_open: boolean
}
