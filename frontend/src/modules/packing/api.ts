import { apiFetch } from '../../shared/api/http'
import type {
  BulkSummaryRow,
  BulkSummarySaveRow,
  ExpectedBlock,
  PackingDemandListResponse,
  PackingExecutionConfig,
  PackingIntervalRecord,
  PackingJob,
  PackingJobEvent,
  PackingMaterialRequest,
  PackingMaterialRequestFormValues,
  PackingMaterialRequirementRow,
  PackingPlanLine,
  PackingPlanLineFormValues,
  PackingRecordingBlockInput,
  PackingRecordingSchedule,
  PackingRecordingScheduleVersion,
  PackingShift,
  PackingWorkCentreAllocation,
  PackingWorkCentreSession,
  RecordIntervalPayload,
  RecordSummaryPayload,
  ReceiveMaterialLine,
  Shift,
  StartShiftWorkCentreEntry,
  SummaryInfo,
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

export interface PauseJobPayload {
  reason: string
  remarks?: string
  release_work_centres: boolean
}

export function holdPackingJob(id: number, payload: PauseJobPayload): Promise<PackingJob> {
  return apiFetch<PackingJob>(`/packing-jobs/${id}/hold/`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function resumePackingJob(id: number, allocationIds: number[]): Promise<PackingJob> {
  return apiFetch<PackingJob>(`/packing-jobs/${id}/resume/`, {
    method: 'POST',
    body: JSON.stringify({ allocation_ids: allocationIds }),
  })
}

export function completePackingJob(id: number): Promise<PackingJob> {
  return apiFetch<PackingJob>(`/packing-jobs/${id}/complete/`, { method: 'POST' })
}

export interface StopJobPayload {
  reason: string
  remarks?: string
  return_to_demand: boolean
}

export function stopPackingJob(id: number, payload: StopJobPayload): Promise<PackingJob> {
  return apiFetch<PackingJob>(`/packing-jobs/${id}/stop/`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function cancelPackingJob(id: number, reason: string): Promise<PackingJob> {
  return apiFetch<PackingJob>(`/packing-jobs/${id}/cancel/`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })
}

export function listJobEvents(jobId: number): Promise<PackingJobEvent[]> {
  return apiFetch<PackingJobEvent[]>(`/packing-jobs/${jobId}/events/`)
}

export interface ReschedulePlanLinePayload {
  date: string
  shift: number
  bay: number
  quantity?: number
}

export function reschedulePackingPlanLine(
  id: number,
  payload: ReschedulePlanLinePayload,
): Promise<PackingPlanLine> {
  return apiFetch<PackingPlanLine>(`/packing-plan-lines/${id}/reschedule/`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
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

export interface TodaysShiftResponse {
  shift: PackingShift | null
  unassigned_jobs: PackingJob[]
  active_jobs: PackingJob[]
}

export function getTodaysShift(date: string, shiftId: number): Promise<TodaysShiftResponse> {
  const query = new URLSearchParams({ date, shift_id: String(shiftId) })
  return apiFetch<TodaysShiftResponse>(`/packing-today/?${query.toString()}`)
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

export function getRecordingBlocks(allocationId: number): Promise<ExpectedBlock[]> {
  return apiFetch<ExpectedBlock[]>(`/packing-allocations/${allocationId}/recording-blocks/`)
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

export function listRecordingSchedules(): Promise<PackingRecordingSchedule[]> {
  return apiFetch<{ results: PackingRecordingSchedule[] }>('/packing-recording-schedules/').then(
    (r) => r.results,
  )
}

export function getRecordingSchedule(id: number): Promise<PackingRecordingSchedule> {
  return apiFetch<PackingRecordingSchedule>(`/packing-recording-schedules/${id}/`)
}

export function createRecordingSchedule(values: {
  name: string
  shift: number
  is_active: boolean
}): Promise<PackingRecordingSchedule> {
  return apiFetch<PackingRecordingSchedule>('/packing-recording-schedules/', {
    method: 'POST',
    body: JSON.stringify(values),
  })
}

export function newRecordingScheduleDraft(
  scheduleId: number,
): Promise<PackingRecordingScheduleVersion> {
  return apiFetch<PackingRecordingScheduleVersion>(
    `/packing-recording-schedules/${scheduleId}/new-draft/`,
    { method: 'POST' },
  )
}

export function replaceRecordingScheduleBlocks(
  versionId: number,
  blocks: PackingRecordingBlockInput[],
): Promise<PackingRecordingScheduleVersion> {
  return apiFetch<PackingRecordingScheduleVersion>(
    `/packing-recording-schedule-versions/${versionId}/blocks/`,
    { method: 'POST', body: JSON.stringify({ blocks }) },
  )
}

export function activateRecordingScheduleVersion(
  versionId: number,
): Promise<PackingRecordingScheduleVersion> {
  return apiFetch<PackingRecordingScheduleVersion>(
    `/packing-recording-schedule-versions/${versionId}/activate/`,
    { method: 'POST' },
  )
}

export function getSummaryInfo(allocationId: number): Promise<SummaryInfo> {
  return apiFetch<SummaryInfo>(`/packing-allocations/${allocationId}/summary-info/`)
}

export function recordSummary(
  allocationId: number,
  payload: RecordSummaryPayload,
): Promise<PackingIntervalRecord> {
  return apiFetch<PackingIntervalRecord>(`/packing-allocations/${allocationId}/summary/`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function listBulkSummaryRows(jobId: number): Promise<BulkSummaryRow[]> {
  return apiFetch<BulkSummaryRow[]>(`/packing-jobs/${jobId}/bulk-summary-rows/`)
}

export function saveBulkSummaries(
  jobId: number,
  rows: BulkSummarySaveRow[],
): Promise<PackingIntervalRecord[]> {
  return apiFetch<PackingIntervalRecord[]>(`/packing-jobs/${jobId}/bulk-summaries/`, {
    method: 'POST',
    body: JSON.stringify({ rows }),
  })
}
