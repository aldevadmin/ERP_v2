import { apiFetch } from '../../shared/api/http'
import type {
  PackingDemandListResponse,
  PackingExecutionConfig,
  PackingIntervalRecord,
  PackingJob,
  PackingMaterialRequest,
  PackingMaterialRequestFormValues,
  PackingMaterialRequirementRow,
  PackingPlanLine,
  PackingPlanLineFormValues,
  PackingShift,
  PackingWorkCentreAllocation,
  PackingWorkCentreSession,
  RecordIntervalPayload,
  ReceiveMaterialLine,
  Shift,
  StartShiftWorkCentreEntry,
  WorkCentreIssueEvent,
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

// Read-only rollup on the Job page — v2 moved allocation creation onto
// Today's Work's "Assign Work" (a Work Centre Session action), so this Job
// page endpoint is retrieve-only now.
export function listJobAllocations(jobId: number): Promise<PackingWorkCentreAllocation[]> {
  return apiFetch<PackingWorkCentreAllocation[]>(`/packing-jobs/${jobId}/allocations/`)
}

export function getExecutionConfig(): Promise<PackingExecutionConfig> {
  return apiFetch<PackingExecutionConfig>('/packing-execution-config/')
}

export function updateExecutionConfig(
  values: Partial<Omit<PackingExecutionConfig, 'id'>>,
): Promise<PackingExecutionConfig> {
  return apiFetch<PackingExecutionConfig>('/packing-execution-config/', {
    method: 'PATCH',
    body: JSON.stringify(values),
  })
}

export function getTodaysShift(date: string, shiftId: number): Promise<{ shift: PackingShift | null }> {
  const query = new URLSearchParams({ date, shift_id: String(shiftId) })
  return apiFetch<{ shift: PackingShift | null }>(`/packing-today/?${query.toString()}`)
}

export function startPackingShift(
  date: string,
  shiftId: number,
  workCentres: StartShiftWorkCentreEntry[],
): Promise<PackingShift> {
  return apiFetch<PackingShift>('/packing-shifts/start/', {
    method: 'POST',
    body: JSON.stringify({ date, shift: shiftId, work_centres: workCentres }),
  })
}

export function stopPackingShift(id: number): Promise<PackingShift> {
  return apiFetch<PackingShift>(`/packing-shifts/${id}/stop/`, { method: 'POST' })
}

export function getWorkCentreSession(id: number): Promise<PackingWorkCentreSession> {
  return apiFetch<PackingWorkCentreSession>(`/packing-work-centre-sessions/${id}/`)
}

export function stopWorkCentreSession(id: number, reason: string): Promise<PackingWorkCentreSession> {
  return apiFetch<PackingWorkCentreSession>(`/packing-work-centre-sessions/${id}/stop/`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })
}

export function resumeWorkCentreSession(id: number): Promise<PackingWorkCentreSession> {
  return apiFetch<PackingWorkCentreSession>(`/packing-work-centre-sessions/${id}/resume/`, {
    method: 'POST',
  })
}

export function listAssignableJobs(sessionId: number): Promise<PackingJob[]> {
  return apiFetch<PackingJob[]>(`/packing-work-centre-sessions/${sessionId}/assignable-jobs/`)
}

export function assignWork(
  sessionId: number,
  values: { job: number; assigned_qty: number },
): Promise<PackingWorkCentreAllocation> {
  return apiFetch<PackingWorkCentreAllocation>(
    `/packing-work-centre-sessions/${sessionId}/allocations/`,
    { method: 'POST', body: JSON.stringify(values) },
  )
}

export function startAllocation(id: number): Promise<PackingWorkCentreAllocation> {
  return apiFetch<PackingWorkCentreAllocation>(`/packing-allocations/${id}/start/`, {
    method: 'POST',
  })
}

export function completeAllocation(id: number): Promise<PackingWorkCentreAllocation> {
  return apiFetch<PackingWorkCentreAllocation>(`/packing-allocations/${id}/complete/`, {
    method: 'POST',
  })
}

export function getNextInterval(
  allocationId: number,
): Promise<{ from_time: string; to_time: string; default_interval_minutes: number }> {
  return apiFetch(`/packing-allocations/${allocationId}/next-interval/`)
}

export function listIntervalRecords(allocationId: number): Promise<PackingIntervalRecord[]> {
  return apiFetch<PackingIntervalRecord[]>(`/packing-allocations/${allocationId}/interval-records/`)
}

export function recordInterval(
  allocationId: number,
  payload: RecordIntervalPayload,
): Promise<PackingIntervalRecord> {
  return apiFetch<PackingIntervalRecord>(`/packing-allocations/${allocationId}/interval-records/`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function correctIntervalRecord(
  id: number,
  payload: Partial<RecordIntervalPayload>,
): Promise<PackingIntervalRecord> {
  return apiFetch<PackingIntervalRecord>(`/packing-interval-records/${id}/correct/`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function reportIssue(values: {
  session: number
  allocation?: number | null
  issue_type: string
  description: string
  stops_productive_time: boolean
}): Promise<WorkCentreIssueEvent> {
  return apiFetch<WorkCentreIssueEvent>('/packing-issue-events/', {
    method: 'POST',
    body: JSON.stringify(values),
  })
}

export function resolveIssue(id: number): Promise<WorkCentreIssueEvent> {
  return apiFetch<WorkCentreIssueEvent>(`/packing-issue-events/${id}/resolve/`, { method: 'POST' })
}
