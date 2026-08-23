import type { CustomerAddress } from '../customers/types'
import type { Employee, Team } from '../accounts/types'
import type { Vendor } from '../vendors/types'

export type ExportOrderStatus =
  | 'PLANNING'
  | 'FULFILMENT'
  | 'PACKING'
  | 'LOADING'
  | 'SHIPPED'
  | 'COMPLETE'
  | 'CANCELLED'

export type StageHistoryState = 'COMPLETED' | 'IN_PROGRESS' | 'PENDING'

export interface StageHistoryEntry {
  status: ExportOrderStatus
  label: string
  state: StageHistoryState
  entered_at: string | null
  completed_at: string | null
}

export interface ExportOrderNote {
  id: number
  text: string
  author: string | null
  created_at: string
}

export const INCOTERMS = [
  'EXW',
  'FCA',
  'CPT',
  'CIP',
  'DAP',
  'DPU',
  'DDP',
  'FAS',
  'FOB',
  'CFR',
  'CIF',
] as const

export type Incoterm = (typeof INCOTERMS)[number]

export interface ExportOrderListItem {
  id: number
  order_number: string
  customer: number
  customer_name: string
  customer_po_number: string
  customer_po_date: string
  destination_port: string
  planned_container_ready_date: string | null
  container_type: string | null
  status: ExportOrderStatus
  export_coordinator_name: string | null
}

export interface ExportOrderListResponse {
  count: number
  next: string | null
  previous: string | null
  results: ExportOrderListItem[]
}

export interface PoVersion {
  id: number
  version_number: number
  document: string
  remarks: string
  is_current: boolean
  created_at: string
  uploaded_by: string | null
}

export interface ExportOrder {
  id: number
  order_number: string
  customer: number
  customer_name: string
  customer_po_number: string
  customer_po_date: string
  export_coordinator: number | null
  export_coordinator_detail: Employee | null
  country: string
  destination_port: string
  requested_shipment_date: string | null
  planned_container_ready_date: string | null
  container_type: string | null
  currency: string
  incoterm: Incoterm | ''
  payment_terms: string
  bill_to: number | null
  bill_to_detail: CustomerAddress | null
  ship_to: number | null
  ship_to_detail: CustomerAddress | null
  status: ExportOrderStatus
  stage_history: StageHistoryEntry[]
  internal_remarks: string
  customer_remarks: string
  po_versions: PoVersion[]
  created_at: string
  updated_at: string
}

export interface CreateExportOrderValues {
  customer: number
  customer_po_number: string
  customer_po_date: string
}

export interface ExportOrderEditValues {
  export_coordinator: number | null
  country: string
  destination_port: string
  requested_shipment_date: string | null
  planned_container_ready_date: string | null
  currency: string
  incoterm: Incoterm | ''
  payment_terms: string
  bill_to: number | null
  ship_to: number | null
  internal_remarks: string
  customer_remarks: string
}

export type ExportOrderLineUnit = 'PIECE' | 'POUCH' | 'CARTON'

export const EXPORT_ORDER_LINE_UNITS: { value: ExportOrderLineUnit; label: string }[] = [
  { value: 'PIECE', label: 'Pieces' },
  { value: 'POUCH', label: 'Pouches' },
  { value: 'CARTON', label: 'Cartons' },
]

export interface ExportOrderLine {
  id: number
  line_number: number
  customer_sku_code: string
  customer_description: string
  item: number | null
  item_code: string | null
  item_name: string | null
  original_customer_quantity: number
  original_customer_unit: ExportOrderLineUnit
  pieces_per_pouch: number | null
  pouches_per_carton: number | null
  pieces_per_carton: number | null
  has_retail_sticker: boolean | null
  source_mapping_version: number | null
  required_pieces: number
  required_pouches: number | null
  required_cartons: number | null
  required_stickers: number
  created_at: string
  updated_at: string
}

export interface ExportOrderLineFormValues {
  customer_sku_code: string
  customer_description: string
  item: number | null
  original_customer_quantity: number
  original_customer_unit: ExportOrderLineUnit
}

export type SkuPlanningStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'READY' | 'DELAYED'
export type SkuRiskStatus = 'ON_TRACK' | 'AT_RISK' | 'DELAYED'

export interface SKUSupplyPlan {
  id: number | null
  required_qty: number
  quantity_from_stock: number
  quantity_to_produce: number
  quantity_to_procure: number
  planning_balance: number
  is_intentionally_underplanned: boolean
  production_planned_start: string | null
  production_expected_completion: string | null
  procurement_planned_order_date: string | null
  procurement_expected_receipt: string | null
  overall_sku_expected_ready_date: string | null
  responsible_team: number | null
  responsible_team_detail: Team | null
  responsible_person: number | null
  responsible_person_detail: Employee | null
  risk_status: SkuRiskStatus
  planning_status: SkuPlanningStatus
  remarks: string
  created_at: string | null
  updated_at: string | null
}

export interface SKUSupplyPlanSummary extends SKUSupplyPlan {
  export_order_line: number
  line_number: number
  customer_sku_code: string
  item_code: string | null
  item_name: string | null
  accepted_from_production: number
  accepted_from_procurement: number
}

export interface SKUSupplyPlanFormValues {
  quantity_from_stock: number
  quantity_to_produce: number
  quantity_to_procure: number
  is_intentionally_underplanned: boolean
  production_planned_start: string | null
  production_expected_completion: string | null
  procurement_planned_order_date: string | null
  procurement_expected_receipt: string | null
  responsible_team: number | null
  responsible_person: number | null
  risk_status: SkuRiskStatus
  planning_status: SkuPlanningStatus
  remarks: string
}

export type ProductionTransactionSource = 'MANUAL' | 'PRODUCTION_MODULE'

export interface ProductionRequirementSummary {
  export_order_line: number
  line_number: number
  customer_sku_code: string
  item_code: string | null
  item_name: string | null
  planned_qty: number
  cumulative_produced: number
  cumulative_accepted: number
  cumulative_rejected: number
  progress: number | null
  balance: number
  status: SkuPlanningStatus
  last_transaction_at: string | null
}

export interface ProductionTransaction {
  id: number
  date: string
  quantity_produced: number
  quantity_accepted: number
  quantity_rejected: number
  party_team: string
  remarks: string
  source: ProductionTransactionSource
  entered_by: string | null
  created_at: string
}

export interface ProductionTransactionFormValues {
  date: string
  quantity_produced: number
  quantity_accepted: number
  quantity_rejected: number
  party_team: string
  remarks: string
}

export interface ProcurementRequirementSummary {
  export_order_line: number
  line_number: number
  customer_sku_code: string
  item_code: string | null
  item_name: string | null
  planned_qty: number
  cumulative_received: number
  cumulative_accepted: number
  cumulative_rejected: number
  progress: number | null
  balance: number
  status: SkuPlanningStatus
  last_transaction_at: string | null
}

export interface ProcurementTransaction {
  id: number
  date: string
  quantity_received: number
  quantity_accepted: number
  quantity_rejected: number
  vendor: number | null
  vendor_detail: Vendor | null
  party_team: string
  remarks: string
  entered_by: string | null
  created_at: string
}

export interface ProcurementTransactionFormValues {
  date: string
  quantity_received: number
  quantity_accepted: number
  quantity_rejected: number
  vendor?: number | null
  party_team: string
  remarks: string
}

export type FulfilmentSource = 'PRODUCTION' | 'PROCUREMENT'

export interface FulfilmentTransaction {
  id: string
  date: string
  source: FulfilmentSource
  export_order_line: number
  customer_sku_code: string
  item_name: string | null
  party_team: string
  quantity: number
  quantity_accepted: number
  quantity_rejected: number
  remarks: string
  entered_by: string | null
  created_at: string
}

export interface FulfilmentTransactionListResponse {
  count: number
  next: string | null
  previous: string | null
  results: FulfilmentTransaction[]
}

export type PackingMaterialType = 'CARTON' | 'POUCH' | 'RETAIL_STICKER' | 'BOX_LABEL'

export const PACKING_MATERIAL_TABS: { key: PackingMaterialType; label: string }[] = [
  { key: 'CARTON', label: 'Cartons' },
  { key: 'POUCH', label: 'Pouches' },
  { key: 'RETAIL_STICKER', label: 'Retail Stickers' },
  { key: 'BOX_LABEL', label: 'Box Labels' },
]

export interface PackingMaterialRequirement {
  id: number | null
  material_type: PackingMaterialType
  required_qty: number
  manual_required_qty: number | null
  available_stock: number
  ordered_qty: number
  shortage: number
  to_procure_qty: number
  manual_to_procure_qty: number | null
  expected_arrival_date: string | null
  received_qty: number | null
  accepted_qty: number | null
  responsible_person: number | null
  responsible_person_detail: Employee | null
  status: SkuPlanningStatus
  remarks: string
  created_at: string | null
  updated_at: string | null
}

export interface PackingMaterialRequirementSummary extends PackingMaterialRequirement {
  export_order_line: number
  line_number: number
  customer_sku_code: string
  item_code: string | null
  item_name: string | null
}

export interface PackingMaterialRequirementFormValues {
  manual_required_qty?: number | null
  available_stock: number
  ordered_qty: number
  manual_to_procure_qty?: number | null
  expected_arrival_date: string | null
  received_qty: number | null
  accepted_qty: number | null
  responsible_person: number | null
  status: SkuPlanningStatus
  remarks: string
}

export type PackingEntryType = 'CARTON_COMPLETED' | 'POUCH_PACKED'

export interface PackingMonitorRow {
  export_order_line: number
  line_number: number
  customer_sku_code: string
  item_code: string | null
  item_name: string | null
  required_cartons: number
  packed_cartons: number
  extra_pouches: number
  balance: number
  progress: number | null
  // Pieces-denominated equivalents driving the SKU Packing Readiness table
  // (business-rules.md "Packing readiness" note) — `packable_qty` is the
  // order's required piece quantity, not bounded by Fulfilment's Accepted
  // Qty; a separate figure from `required_cartons` above, not derived from it.
  packable_qty: number
  packed_pieces: number
  balance_pieces: number
  progress_pieces: number | null
  last_transaction_at: string | null
}

export interface PackingTransaction {
  id: number
  date: string
  entry_type: PackingEntryType
  cartons_packed: number | null
  pouches_packed: number | null
  calculated_pieces: number
  packed_by: number
  packed_by_detail: { id: number; employee_code: string; full_name: string; team: number | null }
  shift_team: string
  remarks: string
  entered_by: string | null
  created_at: string
}

export interface PackingTransactionFormValues {
  date: string
  entry_type: PackingEntryType
  cartons_packed: number | null
  pouches_packed: number | null
  packed_by: number
  shift_team: string
  remarks: string
}

export interface PackingTransactionLogEntry {
  id: number
  date: string
  export_order_line: number
  customer_sku_code: string
  item_name: string | null
  entry_type: PackingEntryType
  cartons_packed: number | null
  pouches_packed: number | null
  calculated_pieces: number
  packed_by_detail: { id: number; employee_code: string; full_name: string; team: number | null }
  shift_team: string
  remarks: string
  entered_by: string | null
  created_at: string
}

export interface PackingTransactionLogResponse {
  count: number
  next: string | null
  previous: string | null
  results: PackingTransactionLogEntry[]
}

export type ShipmentStatus =
  | 'PLANNING'
  | 'PACKING'
  | 'READY_TO_LOAD'
  | 'LOADING'
  | 'SHIPPED'
  | 'CANCELLED'

export interface Shipment {
  id: number
  shipment_number: string
  status: ShipmentStatus
  planned_container_type: string
  planned_ready_date: string | null
  planned_stuffing_date: string | null
  container_number: string
  remarks: string
  created_at: string
  updated_at: string
}

export interface ShipmentFormValues {
  status?: ShipmentStatus
  planned_container_type?: string
  planned_ready_date?: string | null
  planned_stuffing_date?: string | null
  container_number?: string
  remarks?: string
}

export type LoadingStatus = 'EXACT' | 'SHORT_LOADED' | 'EXCESS_LOADED'

export type VarianceReason =
  | 'CONTAINER_SPACE'
  | 'CUSTOMER_APPROVED'
  | 'ADDITIONAL_SPACE'
  | 'PACKING_SHORTAGE'
  | 'PRODUCT_SHORTAGE'
  | 'WEIGHT_RESTRICTION'
  | 'OTHER'

export const VARIANCE_REASON_OPTIONS: { value: VarianceReason; label: string }[] = [
  { value: 'CONTAINER_SPACE', label: 'Container space constraint' },
  { value: 'CUSTOMER_APPROVED', label: 'Customer approved adjustment' },
  { value: 'ADDITIONAL_SPACE', label: 'Additional space available' },
  { value: 'PACKING_SHORTAGE', label: 'Packing shortage' },
  { value: 'PRODUCT_SHORTAGE', label: 'Product shortage' },
  { value: 'WEIGHT_RESTRICTION', label: 'Weight restriction' },
  { value: 'OTHER', label: 'Other' },
]

export interface ShipmentLine {
  id: number
  export_order_line: number
  customer_sku_code: string
  item_code: string | null
  item_name: string | null
  required_cartons: number | null
  planned_qty: number
  planned_cartons: number | null
  packed_cartons: number
  // Cumulative, computed from LoadingTransaction rows — always a number
  // (0 once no transactions exist yet), never null, unlike the old
  // single-mutable-field design.
  actual_loaded_cartons: number
  loaded_pouches: number
  actual_loaded_qty: number
  difference_cartons: number | null
  loading_status: LoadingStatus | null
  last_loading_transaction_at: string | null
  net_weight_kg: number | null
  gross_weight_kg: number | null
  remaining_balance_cartons: number | null
  remarks: string
  created_at: string
  updated_at: string
}

export interface ShipmentLineFormValues {
  export_order_line: number
  planned_qty: number
  remarks?: string
}

export type LoadingEntryType = 'CARTON_LOADED' | 'POUCH_LOADED'

export interface LoadingTransaction {
  id: number
  date: string
  entry_type: LoadingEntryType
  cartons_loaded: number | null
  pouches_loaded: number | null
  calculated_pieces: number
  variance_reason: VarianceReason | ''
  remarks: string
  entered_by: string | null
  created_at: string
}

export interface LoadingTransactionFormValues {
  date: string
  entry_type: LoadingEntryType
  cartons_loaded: number | null
  pouches_loaded: number | null
  variance_reason?: VarianceReason | ''
  remarks: string
}

export interface LoadingTransactionLogEntry {
  id: number
  date: string
  export_order_line: number
  customer_sku_code: string
  item_name: string | null
  entry_type: LoadingEntryType
  cartons_loaded: number | null
  pouches_loaded: number | null
  calculated_pieces: number
  variance_reason: VarianceReason | ''
  remarks: string
  entered_by: string | null
  created_at: string
}

export interface LoadingTransactionLogResponse {
  count: number
  next: string | null
  previous: string | null
  results: LoadingTransactionLogEntry[]
}
