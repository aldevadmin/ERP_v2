import { apiFetch } from '../../shared/api/http'
import type {
  AutoAllocationRow,
  PackingAllocationFormValues,
  PackingDemandListResponse,
  PackingJob,
  PackingMaterialRequest,
  PackingMaterialRequestFormValues,
  PackingMaterialRequirementRow,
  PackingPlanLine,
  PackingPlanLineFormValues,
  PackingWorkCentreAllocation,
  PackingWorkSession,
  ReceiveMaterialLine,
  Shift,
  TodaysWorkRow,
} from './types'

export interface ListPackingOrdersParams {
  search?: string
  customerId?: number
  status?: string
  dueFrom?: string
  dueTo?: string
  unplannedOnly?: boolean
}

export function listPackingOrders(
  params: ListPackingOrdersParams = {},
): Promise<PackingDemandListResponse> {
  const query = new URLSearchParams()
  if (params.search) query.set('search', params.search)
  if (params.customerId) query.set('customer_id', String(params.customerId))
  if (params.status) query.set('status', params.status)
  if (params.dueFrom) query.set('due_from', params.dueFrom)
  if (params.dueTo) query.set('due_to', params.dueTo)
  if (params.unplannedOnly) query.set('unplanned_only', 'true')
  const queryString = query.toString()
  return apiFetch<PackingDemandListResponse>(
    `/packing-orders/${queryString ? `?${queryString}` : ''}`,
  )
}

export function listShifts(params: { isActive?: boolean } = {}): Promise<{ results: Shift[] }> {
  const query = new URLSearchParams()
  if (params.isActive !== undefined) query.set('is_active', String(params.isActive))
  const queryString = query.toString()
  return apiFetch<{ results: Shift[] }>(`/shifts/${queryString ? `?${queryString}` : ''}`)
}

export function createShift(values: {
  name: string
  code: string
  start_time?: string | null
  end_time?: string | null
  is_active: boolean
}): Promise<Shift> {
  return apiFetch<Shift>('/shifts/', { method: 'POST', body: JSON.stringify(values) })
}

export function getShift(id: number): Promise<Shift> {
  return apiFetch<Shift>(`/shifts/${id}/`)
}

export function updateShift(
  id: number,
  values: Partial<{
    name: string
    code: string
    start_time: string | null
    end_time: string | null
    is_active: boolean
  }>,
): Promise<Shift> {
  return apiFetch<Shift>(`/shifts/${id}/`, { method: 'PATCH', body: JSON.stringify(values) })
}

export function deleteShift(id: number): Promise<void> {
  return apiFetch<void>(`/shifts/${id}/`, { method: 'DELETE' })
}

export interface ListPlanLinesParams {
  weekStart?: string
  weekEnd?: string
  shiftId?: number
  bayId?: number
}

export function listPackingPlanLines(
  params: ListPlanLinesParams = {},
): Promise<{ results: PackingPlanLine[] }> {
  const query = new URLSearchParams()
  if (params.weekStart) query.set('week_start', params.weekStart)
  if (params.weekEnd) query.set('week_end', params.weekEnd)
  if (params.shiftId) query.set('shift_id', String(params.shiftId))
  if (params.bayId) query.set('bay_id', String(params.bayId))
  const queryString = query.toString()
  return apiFetch<{ results: PackingPlanLine[] }>(
    `/packing-plan-lines/${queryString ? `?${queryString}` : ''}`,
  )
}

export function createPackingPlanLine(values: PackingPlanLineFormValues): Promise<PackingPlanLine> {
  return apiFetch<PackingPlanLine>('/packing-plan-lines/', {
    method: 'POST',
    body: JSON.stringify(values),
  })
}

export function updatePackingPlanLine(
  id: number,
  values: Partial<PackingPlanLineFormValues>,
): Promise<PackingPlanLine> {
  return apiFetch<PackingPlanLine>(`/packing-plan-lines/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(values),
  })
}

export function deletePackingPlanLine(id: number): Promise<void> {
  return apiFetch<void>(`/packing-plan-lines/${id}/`, { method: 'DELETE' })
}

export function releasePackingPlanLine(id: number): Promise<PackingJob> {
  return apiFetch<PackingJob>(`/packing-plan-lines/${id}/release/`, { method: 'POST' })
}

export function cancelPackingPlanLine(id: number): Promise<PackingPlanLine> {
  return apiFetch<PackingPlanLine>(`/packing-plan-lines/${id}/cancel/`, { method: 'POST' })
}

export function getPackingJob(id: number): Promise<PackingJob> {
  return apiFetch<PackingJob>(`/packing-jobs/${id}/`)
}

export function holdPackingJob(id: number): Promise<PackingJob> {
  return apiFetch<PackingJob>(`/packing-jobs/${id}/hold/`, { method: 'POST' })
}

export function resumePackingJob(id: number): Promise<PackingJob> {
  return apiFetch<PackingJob>(`/packing-jobs/${id}/resume/`, { method: 'POST' })
}

export function completePackingJob(id: number): Promise<PackingJob> {
  return apiFetch<PackingJob>(`/packing-jobs/${id}/complete/`, { method: 'POST' })
}

export function listJobMaterialRequirements(
  jobId: number,
): Promise<PackingMaterialRequirementRow[]> {
  return apiFetch<PackingMaterialRequirementRow[]>(`/packing-jobs/${jobId}/material-requirements/`)
}

export function listJobMaterialRequests(jobId: number): Promise<PackingMaterialRequest[]> {
  return apiFetch<PackingMaterialRequest[]>(`/packing-jobs/${jobId}/material-requests/`)
}

export function createJobMaterialRequest(
  jobId: number,
  values: Omit<PackingMaterialRequestFormValues, 'job'>,
): Promise<PackingMaterialRequest> {
  return apiFetch<PackingMaterialRequest>(`/packing-jobs/${jobId}/material-requests/`, {
    method: 'POST',
    body: JSON.stringify(values),
  })
}

export function receiveMaterialRequest(
  requestId: number,
  lines: ReceiveMaterialLine[],
): Promise<PackingMaterialRequest> {
  return apiFetch<PackingMaterialRequest>(`/packing-material-requests/${requestId}/receive/`, {
    method: 'POST',
    body: JSON.stringify({ lines }),
  })
}

export function listJobAllocations(jobId: number): Promise<PackingWorkCentreAllocation[]> {
  return apiFetch<PackingWorkCentreAllocation[]>(`/packing-jobs/${jobId}/allocations/`)
}

export function createJobAllocation(
  jobId: number,
  values: Omit<PackingAllocationFormValues, 'job'>,
): Promise<PackingWorkCentreAllocation> {
  return apiFetch<PackingWorkCentreAllocation>(`/packing-jobs/${jobId}/allocations/`, {
    method: 'POST',
    body: JSON.stringify(values),
  })
}

export function getAllocation(id: number): Promise<PackingWorkCentreAllocation> {
  return apiFetch<PackingWorkCentreAllocation>(`/packing-allocations/${id}/`)
}

export function updateAllocation(
  id: number,
  values: Partial<PackingAllocationFormValues>,
): Promise<PackingWorkCentreAllocation> {
  return apiFetch<PackingWorkCentreAllocation>(`/packing-allocations/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(values),
  })
}

export function autoAllocationPreview(
  jobId: number,
  workCentreIds: number[],
  date: string,
): Promise<{ allocations: AutoAllocationRow[] }> {
  return apiFetch(`/packing-jobs/${jobId}/auto-allocation-preview/`, {
    method: 'POST',
    body: JSON.stringify({ work_centre_ids: workCentreIds, date }),
  })
}

export function autoAllocate(
  jobId: number,
  workCentreIds: number[],
  date: string,
): Promise<{ allocations: PackingWorkCentreAllocation[] }> {
  return apiFetch(`/packing-jobs/${jobId}/auto-allocate/`, {
    method: 'POST',
    body: JSON.stringify({ work_centre_ids: workCentreIds, date }),
  })
}

export function startWorkSession(allocationId: number): Promise<PackingWorkSession> {
  return apiFetch<PackingWorkSession>(`/packing-allocations/${allocationId}/start-session/`, {
    method: 'POST',
  })
}

export function getWorkSession(id: number): Promise<PackingWorkSession> {
  return apiFetch<PackingWorkSession>(`/packing-work-sessions/${id}/`)
}

export interface CompleteSessionPayload {
  process_version: number
  batch_lot_number: string
  employees: number[]
  inputs_write: { input_definition: number; quantity: number }[]
  outputs_write: { output_definition: number; quantity: number }[]
  remarks?: string
}

export function completeWorkSession(
  id: number,
  payload: CompleteSessionPayload,
): Promise<PackingWorkSession> {
  return apiFetch<PackingWorkSession>(`/packing-work-sessions/${id}/complete/`, {
    method: 'POST',
    body: JSON.stringify({ execution: payload }),
  })
}

export function listTodaysWork(date: string, shiftId?: number): Promise<{ results: TodaysWorkRow[] }> {
  const query = new URLSearchParams({ date })
  if (shiftId) query.set('shift_id', String(shiftId))
  return apiFetch<{ results: TodaysWorkRow[] }>(`/packing-today/?${query.toString()}`)
}
