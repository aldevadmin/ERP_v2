export type PackingLineStatus = 'BACKLOG' | 'IN_PROGRESS' | 'ON_HOLD' | 'COMPLETED'

export interface PackingLineRow {
  export_order_line: number
  customer_id: number
  customer_name: string
  order_no: string
  customer_sku_code: string
  required_pieces: number
  required_cartons: number
  packed_cartons: number
  pending_cartons: number
  is_on_hold: boolean
  status: PackingLineStatus
  last_updated_at: string | null
}

export type PackingAllotmentStatus = 'DRAFT' | 'RELEASED'

export interface PackingAllotmentRow {
  id: number
  export_order_line: number
  customer_name: string
  order_no: string
  customer_sku_code: string
  date: string
  allotted_cartons: number
  status: PackingAllotmentStatus
  released_at: string | null
  pending_cartons: number
  packed_today_cartons: number
  job_id: string | null
  pieces_per_pouch: number | null
  pouches_per_carton: number | null
  pieces_per_carton: number | null
  total_pieces: number | null
}

export type WorkCentreOperationalStatus = 'RUNNING' | 'DOWN'

export interface WorkCentreRow {
  id: number
  code: string
  name: string
  is_active: boolean
  status: WorkCentreOperationalStatus
}

export interface WorkCentreRecordRow {
  id: number
  job_id: string | null
  work_centre_code: string
  customer_name: string
  order_no: string
  customer_sku_code: string
  packed_plates: number
  pouches_packed: number
  downgraded: number
  rejected: number
  total_plates: number
  created_at: string
}

export interface RecordWorkCentreOutputPayload {
  allotment: number
  work_centre: number
  packed_plates: number
  pouches_packed: number
  downgraded: number
  rejected: number
  employee_ids: number[]
}

export interface BoxingRecordRow {
  id: number
  job_id: string | null
  work_centre_code: string
  customer_name: string
  order_no: string
  customer_sku_code: string
  boxes_packed: number
  created_at: string
}

export interface RecordBoxingOutputPayload {
  allotment: number
  work_centre: number
  boxes_packed: number
  employee_ids: number[]
}

export interface DayReconciliationRow {
  id: number
  job_id: string | null
  customer_name: string
  order_no: string
  customer_sku_code: string
  allotted_cartons: number
  allotted_plates: number | null
  recorded_plates: number
  shortfall_plates: number | null
  // Pouches-vs-boxes reconciliation — a soft warning, never blocking. Both
  // `expected_boxes`/`boxing_discrepancy` are null when the line has no
  // `pouches_per_carton` to judge against, not when there's no mismatch.
  pouches_packed: number
  boxes_packed: number
  expected_boxes: number | null
  boxing_discrepancy: number | null
}

export interface DayReconciliation {
  date: string
  already_closed: boolean
  rows: DayReconciliationRow[]
}
