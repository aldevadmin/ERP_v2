import { apiFetch } from '../../shared/api/http'
import type {
  ActivationResult,
  BatchLotMode,
  CaptureMode,
  CompletionMode,
  InputConsumptionMode,
  OutputClassification,
  OutputClassificationFormValues,
  OutputClassificationListResponse,
  Process,
  ProcessBasicsValues,
  ProcessCategory,
  ProcessCategoryFormValues,
  ProcessCategoryListResponse,
  ProcessInput,
  ProcessInputFormValues,
  ProcessListResponse,
  ProcessOutput,
  ProcessOutputCaptureFormValues,
  ProcessOutputFormValues,
  ProcessParameter,
  ProcessParameterFormValues,
  ProcessPerformanceFormValues,
  ProcessRulesFormValues,
  ProcessWorkCentreFormValues,
  QcRequirement,
  StandardRateConfigLevel,
  TransactionFrequency,
  VersionStatus,
  WorkCentreRequirement,
} from './types'

export interface ListProcessCategoriesParams {
  search?: string
  isActive?: boolean
}

export function listProcessCategories(
  params: ListProcessCategoriesParams = {},
): Promise<ProcessCategoryListResponse> {
  const query = new URLSearchParams()
  if (params.search) query.set('search', params.search)
  if (params.isActive !== undefined) query.set('is_active', String(params.isActive))
  const queryString = query.toString()
  return apiFetch<ProcessCategoryListResponse>(
    `/process-categories/${queryString ? `?${queryString}` : ''}`,
  )
}

export function getProcessCategory(id: number): Promise<ProcessCategory> {
  return apiFetch<ProcessCategory>(`/process-categories/${id}/`)
}

export function createProcessCategory(
  values: ProcessCategoryFormValues,
): Promise<ProcessCategory> {
  return apiFetch<ProcessCategory>('/process-categories/', {
    method: 'POST',
    body: JSON.stringify(values),
  })
}

export function updateProcessCategory(
  id: number,
  values: ProcessCategoryFormValues,
): Promise<ProcessCategory> {
  return apiFetch<ProcessCategory>(`/process-categories/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(values),
  })
}

export function deleteProcessCategory(id: number): Promise<void> {
  return apiFetch<void>(`/process-categories/${id}/`, { method: 'DELETE' })
}

export interface ListOutputClassificationsParams {
  search?: string
  isActive?: boolean
}

export function listOutputClassifications(
  params: ListOutputClassificationsParams = {},
): Promise<OutputClassificationListResponse> {
  const query = new URLSearchParams()
  if (params.search) query.set('search', params.search)
  if (params.isActive !== undefined) query.set('is_active', String(params.isActive))
  const queryString = query.toString()
  return apiFetch<OutputClassificationListResponse>(
    `/output-classifications/${queryString ? `?${queryString}` : ''}`,
  )
}

export function getOutputClassification(id: number): Promise<OutputClassification> {
  return apiFetch<OutputClassification>(`/output-classifications/${id}/`)
}

export function createOutputClassification(
  values: OutputClassificationFormValues,
): Promise<OutputClassification> {
  return apiFetch<OutputClassification>('/output-classifications/', {
    method: 'POST',
    body: JSON.stringify(values),
  })
}

export function updateOutputClassification(
  id: number,
  values: OutputClassificationFormValues,
): Promise<OutputClassification> {
  return apiFetch<OutputClassification>(`/output-classifications/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(values),
  })
}

export function deleteOutputClassification(id: number): Promise<void> {
  return apiFetch<void>(`/output-classifications/${id}/`, { method: 'DELETE' })
}

// The backend models a process as a ProcessDefinition (stable identity)
// plus a ProcessDefinitionVersion (what's actually configured). The
// frontend keeps a single flat `Process` shape — this module is the one
// place that reconciles the two, so every page can keep treating
// "a process" as one flat thing.
interface RawProcessVersion {
  id: number
  version_number: number
  status: VersionStatus
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

interface RawProcessDefinition {
  id: number
  name: string
  code: string
  is_active: boolean
  current_version: RawProcessVersion | null
}

interface RawProcessListResponse {
  count: number
  next: string | null
  previous: string | null
  results: RawProcessDefinition[]
}

function flattenProcess(raw: RawProcessDefinition): Process {
  const version = raw.current_version
  return {
    id: raw.id,
    name: raw.name,
    code: raw.code,
    is_active: raw.is_active,
    version_id: version?.id ?? 0,
    version_number: version?.version_number ?? 0,
    version_status: version?.status ?? 'DRAFT',
    category: version?.category ?? 0,
    category_name: version?.category_name ?? '',
    work_centre_requirement: version?.work_centre_requirement ?? '',
    operator_required: version?.operator_required ?? true,
    standard_rate_config_level: version?.standard_rate_config_level ?? '',
    capture_mode: version?.capture_mode ?? '',
    position_label: version?.position_label ?? '',
    default_position_count: version?.default_position_count ?? null,
    allow_work_centre_override: version?.allow_work_centre_override ?? true,
    allow_different_sku_per_position: version?.allow_different_sku_per_position ?? true,
    allow_manual_standard_rate: version?.allow_manual_standard_rate ?? true,
    reserve_machine_derived_rate: version?.reserve_machine_derived_rate ?? true,
    batch_lot_mode: version?.batch_lot_mode ?? 'OPTIONAL',
    transaction_frequency: version?.transaction_frequency ?? '',
    partial_output_forward: version?.partial_output_forward ?? true,
    allow_over_production: version?.allow_over_production ?? false,
    over_production_tolerance_percent: version?.over_production_tolerance_percent ?? null,
    input_consumption_mode: version?.input_consumption_mode ?? 'MANUAL',
    completion_mode: version?.completion_mode ?? 'OPERATOR',
    qc_requirement: version?.qc_requirement ?? 'NONE',
    allow_correction_with_audit_trail: version?.allow_correction_with_audit_trail ?? true,
    allow_destructive_delete: version?.allow_destructive_delete ?? false,
    permit_machine_generated_source: version?.permit_machine_generated_source ?? true,
    description: version?.description ?? '',
    inputs: version?.inputs ?? [],
    outputs: version?.outputs ?? [],
    parameters: version?.parameters ?? [],
  }
}

export interface ListProcessesParams {
  search?: string
  isActive?: boolean
  category?: number
}

export function listProcesses(params: ListProcessesParams = {}): Promise<ProcessListResponse> {
  const query = new URLSearchParams()
  if (params.search) query.set('search', params.search)
  if (params.isActive !== undefined) query.set('is_active', String(params.isActive))
  if (params.category !== undefined) query.set('category', String(params.category))
  const queryString = query.toString()
  return apiFetch<RawProcessListResponse>(
    `/process-definitions/${queryString ? `?${queryString}` : ''}`,
  ).then((response) => ({ ...response, results: response.results.map(flattenProcess) }))
}

export function getProcess(id: number): Promise<Process> {
  return apiFetch<RawProcessDefinition>(`/process-definitions/${id}/`).then(flattenProcess)
}

export function createProcess(values: ProcessBasicsValues): Promise<Process> {
  return apiFetch<RawProcessDefinition>('/process-definitions/', {
    method: 'POST',
    body: JSON.stringify(values),
  }).then(flattenProcess)
}

export function updateProcess(
  id: number,
  values: Partial<ProcessBasicsValues> & { is_active?: boolean },
): Promise<Process> {
  return apiFetch<RawProcessDefinition>(`/process-definitions/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(values),
  }).then(flattenProcess)
}

export function duplicateProcess(id: number): Promise<Process> {
  return apiFetch<RawProcessDefinition>(`/process-definitions/${id}/duplicate/`, {
    method: 'POST',
  }).then(flattenProcess)
}

export function deleteProcess(id: number): Promise<void> {
  return apiFetch<void>(`/process-definitions/${id}/`, { method: 'DELETE' })
}

export interface SaveProcessInputsPayload {
  inputs: ProcessInputFormValues[]
  batch_lot_mode?: BatchLotMode
}

export interface SaveProcessInputsResult {
  inputs: ProcessInput[]
  batch_lot_mode: BatchLotMode
}

export function saveProcessInputs(
  versionId: number,
  payload: SaveProcessInputsPayload,
): Promise<SaveProcessInputsResult> {
  return apiFetch<RawProcessVersion>(`/process-definition-versions/${versionId}/inputs/`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }).then((version) => ({ inputs: version.inputs, batch_lot_mode: version.batch_lot_mode }))
}

export interface SaveProcessOutputsPayload {
  outputs: ProcessOutputFormValues[]
}

export function saveProcessOutputs(
  versionId: number,
  payload: SaveProcessOutputsPayload,
): Promise<ProcessOutput[]> {
  return apiFetch<RawProcessVersion>(`/process-definition-versions/${versionId}/outputs/`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }).then((version) => version.outputs)
}

export function saveProcessWorkCentre(
  versionId: number,
  values: Partial<ProcessWorkCentreFormValues>,
): Promise<ProcessWorkCentreFormValues> {
  return apiFetch<RawProcessVersion>(`/process-definition-versions/${versionId}/`, {
    method: 'PATCH',
    body: JSON.stringify(values),
  }).then((version) => ({
    work_centre_requirement: version.work_centre_requirement as WorkCentreRequirement,
    operator_required: version.operator_required,
    standard_rate_config_level: version.standard_rate_config_level as StandardRateConfigLevel,
  }))
}

export function saveProcessOutputCapture(
  versionId: number,
  values: Partial<ProcessOutputCaptureFormValues>,
): Promise<ProcessOutputCaptureFormValues> {
  return apiFetch<RawProcessVersion>(`/process-definition-versions/${versionId}/`, {
    method: 'PATCH',
    body: JSON.stringify(values),
  }).then((version) => ({
    capture_mode: version.capture_mode as CaptureMode,
    position_label: version.position_label,
    default_position_count: version.default_position_count,
    allow_work_centre_override: version.allow_work_centre_override,
    allow_different_sku_per_position: version.allow_different_sku_per_position,
  }))
}

export interface SaveProcessParametersPayload {
  parameters: ProcessParameterFormValues[]
}

export function saveProcessParameters(
  versionId: number,
  payload: SaveProcessParametersPayload,
): Promise<ProcessParameter[]> {
  return apiFetch<RawProcessVersion>(`/process-definition-versions/${versionId}/parameters/`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }).then((version) => version.parameters)
}

export function saveProcessPerformance(
  versionId: number,
  values: Partial<ProcessPerformanceFormValues>,
): Promise<ProcessPerformanceFormValues> {
  return apiFetch<RawProcessVersion>(`/process-definition-versions/${versionId}/`, {
    method: 'PATCH',
    body: JSON.stringify(values),
  }).then((version) => ({
    allow_manual_standard_rate: version.allow_manual_standard_rate,
    reserve_machine_derived_rate: version.reserve_machine_derived_rate,
  }))
}

export function saveProcessRules(
  versionId: number,
  values: Partial<ProcessRulesFormValues>,
): Promise<ProcessRulesFormValues> {
  return apiFetch<RawProcessVersion>(`/process-definition-versions/${versionId}/`, {
    method: 'PATCH',
    body: JSON.stringify(values),
  }).then((version) => ({
    transaction_frequency: version.transaction_frequency as TransactionFrequency,
    batch_lot_mode: version.batch_lot_mode,
    partial_output_forward: version.partial_output_forward,
    allow_over_production: version.allow_over_production,
    over_production_tolerance_percent: version.over_production_tolerance_percent,
    input_consumption_mode: version.input_consumption_mode,
    completion_mode: version.completion_mode,
    qc_requirement: version.qc_requirement,
    allow_correction_with_audit_trail: version.allow_correction_with_audit_trail,
    allow_destructive_delete: version.allow_destructive_delete,
    permit_machine_generated_source: version.permit_machine_generated_source,
  }))
}

export function activateProcess(versionId: number): Promise<ActivationResult> {
  return apiFetch<RawProcessVersion & { warnings: string[] }>(
    `/process-definition-versions/${versionId}/activate/`,
    { method: 'POST' },
  ).then((version) => ({
    version_status: version.status,
    warnings: version.warnings,
  }))
}
