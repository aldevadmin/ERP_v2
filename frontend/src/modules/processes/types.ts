export interface ProcessCategory {
  id: number
  name: string
  is_active: boolean
}

export interface ProcessCategoryListResponse {
  count: number
  next: string | null
  previous: string | null
  results: ProcessCategory[]
}

export interface ProcessCategoryFormValues {
  name: string
  is_active: boolean
}

export type WorkCentreRequirement = 'MACHINE' | 'STATION' | 'EITHER' | 'NONE'

export const WORK_CENTRE_REQUIREMENT_OPTIONS: { value: WorkCentreRequirement; label: string }[] = [
  { value: 'MACHINE', label: 'Machine' },
  { value: 'STATION', label: 'Station' },
  { value: 'EITHER', label: 'Machine or Station' },
  { value: 'NONE', label: 'No work centre required' },
]

export type StandardRateConfigLevel = 'PROCESS' | 'WORK_CENTRE' | 'TOOLING_POSITION'

export const STANDARD_RATE_CONFIG_LEVEL_OPTIONS: {
  value: StandardRateConfigLevel
  label: string
}[] = [
  { value: 'PROCESS', label: 'Process level' },
  { value: 'WORK_CENTRE', label: 'Work Centre level' },
  { value: 'TOOLING_POSITION', label: 'Tooling / Position level' },
]

export type CaptureMode = 'WORK_CENTRE_TOTAL' | 'POSITION_LEVEL' | 'BOTH'

export const CAPTURE_MODE_OPTIONS: { value: CaptureMode; label: string }[] = [
  { value: 'WORK_CENTRE_TOTAL', label: 'One total for the work centre' },
  { value: 'POSITION_LEVEL', label: 'Separate output from parallel positions' },
  { value: 'BOTH', label: 'Both' },
]

export type ParameterDataType =
  | 'NUMBER'
  | 'TEXT'
  | 'BOOLEAN'
  | 'SELECT'
  | 'REFERENCE'
  | 'DATE'
  | 'DATETIME'

export const PARAMETER_DATA_TYPE_OPTIONS: { value: ParameterDataType; label: string }[] = [
  { value: 'NUMBER', label: 'Number' },
  { value: 'TEXT', label: 'Text' },
  { value: 'BOOLEAN', label: 'Boolean' },
  { value: 'SELECT', label: 'Select' },
  { value: 'REFERENCE', label: 'Reference' },
  { value: 'DATE', label: 'Date' },
  { value: 'DATETIME', label: 'Date & Time' },
]

export type ParameterCaptureAt = 'SETUP' | 'START' | 'DURING' | 'COMPLETION'

export const PARAMETER_CAPTURE_AT_OPTIONS: { value: ParameterCaptureAt; label: string }[] = [
  { value: 'SETUP', label: 'Setup' },
  { value: 'START', label: 'Start' },
  { value: 'DURING', label: 'During' },
  { value: 'COMPLETION', label: 'Completion' },
]

export type VersionStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED'

export type InputType = 'MATERIAL' | 'WIP' | 'PACKAGING' | 'OTHER'

export const INPUT_TYPE_OPTIONS: { value: InputType; label: string }[] = [
  { value: 'MATERIAL', label: 'Material' },
  { value: 'WIP', label: 'WIP' },
  { value: 'PACKAGING', label: 'Packaging' },
  { value: 'OTHER', label: 'Other' },
]

export type QuantityCapture = 'MANUAL' | 'FORMULA' | 'OPTIONAL'

export const QUANTITY_CAPTURE_OPTIONS: { value: QuantityCapture; label: string }[] = [
  { value: 'MANUAL', label: 'Manual' },
  { value: 'FORMULA', label: 'Formula' },
  { value: 'OPTIONAL', label: 'Optional' },
]

export type BatchLotMode = 'DISABLED' | 'OPTIONAL' | 'REQUIRED'

export const BATCH_LOT_MODE_OPTIONS: { value: BatchLotMode; label: string }[] = [
  { value: 'DISABLED', label: 'Disabled' },
  { value: 'OPTIONAL', label: 'Optional' },
  { value: 'REQUIRED', label: 'Required' },
]

export type TransactionFrequency = 'SHIFT' | 'BATCH' | 'MANUAL' | 'MACHINE'

export const TRANSACTION_FREQUENCY_OPTIONS: { value: TransactionFrequency; label: string }[] = [
  { value: 'SHIFT', label: 'Shift based' },
  { value: 'BATCH', label: 'Batch based' },
  { value: 'MANUAL', label: 'Manual entry' },
  { value: 'MACHINE', label: 'Machine driven' },
]

export type InputConsumptionMode = 'MANUAL' | 'FORMULA' | 'FUTURE_INVENTORY'

export const INPUT_CONSUMPTION_MODE_OPTIONS: { value: InputConsumptionMode; label: string }[] = [
  { value: 'MANUAL', label: 'Manual capture' },
  { value: 'FORMULA', label: 'Formula driven' },
  { value: 'FUTURE_INVENTORY', label: 'Future inventory integration' },
]

export type CompletionMode = 'OPERATOR' | 'TARGET_REACHED'

export const COMPLETION_MODE_OPTIONS: { value: CompletionMode; label: string }[] = [
  { value: 'OPERATOR', label: 'Operator marks transaction complete' },
  { value: 'TARGET_REACHED', label: 'Target quantity reached' },
]

export type QcRequirement = 'NONE' | 'REQUIRED'

export const QC_REQUIREMENT_OPTIONS: { value: QcRequirement; label: string }[] = [
  { value: 'NONE', label: 'None' },
  { value: 'REQUIRED', label: 'QC required before output can move forward' },
]

/** One configured Step 2 input row, as returned by the API — `item_id`/
 * `item_label` are read-only (server-resolved from whichever of
 * Material/Product `input_type` points at). */
export interface ProcessInput {
  id: number
  sequence: number
  input_type: InputType
  item_id: number
  item_label: string
  uom: string
  quantity_capture: QuantityCapture
  is_required: boolean
}

/** What the Inputs editor writes — `item` is a plain id, resolved
 * server-side against Material or Product depending on `input_type`. */
export interface ProcessInputFormValues {
  id?: number
  input_type: InputType
  item: number
  uom: string
  quantity_capture: QuantityCapture
  is_required: boolean
}

export interface OutputClassification {
  id: number
  name: string
  is_active: boolean
}

export interface OutputClassificationListResponse {
  count: number
  next: string | null
  previous: string | null
  results: OutputClassification[]
}

export interface OutputClassificationFormValues {
  name: string
  is_active: boolean
}

/** Which master an output's `item_id` was resolved against — not a
 * business category (that's `classification` below), it only exists
 * because the Output Item picker searches both Material and Product in
 * one combined list. */
export type OutputItemType = 'MATERIAL' | 'PRODUCT'

/** One configured Step 3 output row, as returned by the API — `item_id`/
 * `item_label` are read-only (server-resolved from whichever of
 * Material/Product `item_type` points at). */
export interface ProcessOutput {
  id: number
  sequence: number
  item_type: OutputItemType
  item_id: number
  item_label: string
  uom: string
  classification: number
  classification_name: string
  can_move_forward: boolean
  creates_traceable_output: boolean
  default_storage_destination: string
}

/** What the Outputs editor writes — `item` is a plain id, resolved
 * server-side against Material or Product depending on `item_type`. */
export interface ProcessOutputFormValues {
  id?: number
  item_type: OutputItemType
  item: number
  uom: string
  classification: number
  can_move_forward: boolean
  creates_traceable_output: boolean
  default_storage_destination: string
}

/** One configured Step 6 parameter row, as returned by the API. */
export interface ProcessParameter {
  id: number
  sequence: number
  label: string
  code: string
  data_type: ParameterDataType
  unit: string
  capture_at: ParameterCaptureAt
  is_required: boolean
  default_value: string
}

/** What the Parameters editor writes — `code` is auto-generated from
 * `label` client-side (same slugify-until-touched pattern as
 * `ProcessBasicsValues.code`) but always sent explicitly. */
export interface ProcessParameterFormValues {
  id?: number
  label: string
  code: string
  data_type: ParameterDataType
  unit: string
  capture_at: ParameterCaptureAt
  is_required: boolean
  default_value: string
}

export interface Process {
  id: number
  name: string
  code: string
  is_active: boolean
  version_id: number
  version_number: number
  version_status: VersionStatus
  category: number
  category_name: string
  work_centre_requirement: WorkCentreRequirement | ''
  operator_required: boolean
  standard_rate_config_level: StandardRateConfigLevel | ''
  capture_mode: CaptureMode | ''
  position_label: string
  default_position_count: number | null
  allow_work_centre_override: boolean
  allow_different_sku_per_position: boolean
  allow_manual_standard_rate: boolean
  reserve_machine_derived_rate: boolean
  batch_lot_mode: BatchLotMode
  transaction_frequency: TransactionFrequency | ''
  partial_output_forward: boolean
  allow_over_production: boolean
  over_production_tolerance_percent: number | null
  input_consumption_mode: InputConsumptionMode
  completion_mode: CompletionMode
  qc_requirement: QcRequirement
  allow_correction_with_audit_trail: boolean
  allow_destructive_delete: boolean
  permit_machine_generated_source: boolean
  description: string
  inputs: ProcessInput[]
  outputs: ProcessOutput[]
  parameters: ProcessParameter[]
}

/** What the Work Centre (Step 4) editor writes — all three fields are
 * required once the step is saved, but the process may not have visited
 * this step yet (hence the `| ''` on the enum-typed fields elsewhere). */
export interface ProcessWorkCentreFormValues {
  work_centre_requirement: WorkCentreRequirement
  operator_required: boolean
  standard_rate_config_level: StandardRateConfigLevel
}

/** What the Output Capture (Step 5) editor writes. `position_label`/
 * `default_position_count` are only meaningful (and required server-side)
 * when `capture_mode` is `POSITION_LEVEL` or `BOTH`. */
export interface ProcessOutputCaptureFormValues {
  capture_mode: CaptureMode
  position_label: string
  default_position_count: number | null
  allow_work_centre_override: boolean
  allow_different_sku_per_position: boolean
}

/** What the Parameters (Step 6) PERFORMANCE checkboxes write — routes
 * through the same generic version PATCH as Steps 4/5. */
export interface ProcessPerformanceFormValues {
  allow_manual_standard_rate: boolean
  reserve_machine_derived_rate: boolean
}

/** What the Rules (Step 7) editor writes — routes through the same generic
 * version PATCH as Steps 4/5/6. `over_production_tolerance_percent` is only
 * meaningful (and required server-side) when `allow_over_production` is
 * true. `batch_lot_mode` is the same field Step 2 (Inputs) already owns —
 * this step just re-displays/re-edits it under TRACEABILITY per the
 * wireframe, still writing straight to the version, not through Step 2's
 * whole-list-replace inputs endpoint. */
export interface ProcessRulesFormValues {
  transaction_frequency: TransactionFrequency
  batch_lot_mode: BatchLotMode
  partial_output_forward: boolean
  allow_over_production: boolean
  over_production_tolerance_percent: number | null
  input_consumption_mode: InputConsumptionMode
  completion_mode: CompletionMode
  qc_requirement: QcRequirement
  allow_correction_with_audit_trail: boolean
  allow_destructive_delete: boolean
  permit_machine_generated_source: boolean
}

/** What Step 8's Save & Activate returns. `warnings` are non-blocking —
 * activation still succeeded, but something (e.g. no work centre mapped
 * yet) is worth the coordinator's attention. */
export interface ActivationResult {
  version_status: VersionStatus
  warnings: string[]
}

export interface ProcessListResponse {
  count: number
  next: string | null
  previous: string | null
  results: Process[]
}

/** What the Basics step alone collects and saves — the other wizard steps
 * beyond Basics/Inputs aren't built yet. */
export interface ProcessBasicsValues {
  name: string
  code: string
  category: number
  description: string
}

export const PROCESS_WIZARD_STEPS = [
  { key: 'basics', label: 'Basics' },
  { key: 'inputs', label: 'Inputs' },
  { key: 'outputs', label: 'Outputs' },
  { key: 'work_centre', label: 'Work Centre' },
  { key: 'output_capture', label: 'Output Capture' },
  { key: 'parameters', label: 'Parameters' },
  { key: 'rules', label: 'Rules' },
  { key: 'review', label: 'Review' },
] as const

export type ProcessWizardStepKey = (typeof PROCESS_WIZARD_STEPS)[number]['key']
