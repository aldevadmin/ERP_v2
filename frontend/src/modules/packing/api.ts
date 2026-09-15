import { apiFetch } from '../../shared/api/http'
import type {
  BoxingRecordRow,
  DayReconciliation,
  PackingAllotmentRow,
  PackingAllotmentStatus,
  PackingLineRow,
  RecordBoxingOutputPayload,
  RecordWorkCentreOutputPayload,
  WorkCentreOperationalStatus,
  WorkCentreRecordRow,
  WorkCentreRow,
} from './types'

export function listPackingLines(customerId?: number): Promise<PackingLineRow[]> {
  const query = customerId ? `?customer=${customerId}` : ''
  return apiFetch<PackingLineRow[]>(`/packing-lines/${query}`)
}

export function setPackingLineHold(lineId: number, isOnHold: boolean): Promise<PackingLineRow> {
  return apiFetch<PackingLineRow>(`/packing-lines/${lineId}/hold/`, {
    method: 'PATCH',
    body: JSON.stringify({ is_on_hold: isOnHold }),
  })
}

export function selectPackingLine(lineId: number): Promise<PackingAllotmentRow> {
  return apiFetch<PackingAllotmentRow>(`/packing-lines/${lineId}/select/`, { method: 'POST' })
}

interface PackingAllotmentListResponse {
  count: number
  next: string | null
  previous: string | null
  results: PackingAllotmentRow[]
}

export function listPackingAllotments(params: {
  status?: PackingAllotmentStatus
  date?: string
} = {}): Promise<PackingAllotmentRow[]> {
  const query = new URLSearchParams()
  if (params.status) query.set('status', params.status)
  if (params.date) query.set('date', params.date)
  const queryString = query.toString()
  return apiFetch<PackingAllotmentListResponse>(
    `/packing-allotments/${queryString ? `?${queryString}` : ''}`,
  ).then((response) => response.results)
}

export function updateAllotmentQuantity(id: number, cartons: number): Promise<PackingAllotmentRow> {
  return apiFetch<PackingAllotmentRow>(`/packing-allotments/${id}/quantity/`, {
    method: 'PATCH',
    body: JSON.stringify({ allotted_cartons: cartons }),
  })
}

export function removeAllotment(id: number): Promise<void> {
  return apiFetch<void>(`/packing-allotments/${id}/`, { method: 'DELETE' })
}

export function releaseAllotments(): Promise<PackingAllotmentRow[]> {
  return apiFetch<PackingAllotmentRow[]>('/packing-allotments/release/', { method: 'POST' })
}

export function listWorkCentresLite(): Promise<WorkCentreRow[]> {
  return apiFetch<WorkCentreRow[]>('/packing-lite-work-centres/')
}

export function listWorkCentreRecords(): Promise<WorkCentreRecordRow[]> {
  return apiFetch<WorkCentreRecordRow[]>('/packing-lite-work-centre-records/')
}

export function recordWorkCentreOutput(
  payload: RecordWorkCentreOutputPayload,
): Promise<WorkCentreRecordRow> {
  return apiFetch<WorkCentreRecordRow>('/packing-lite-work-centre-records/', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function listBoxingRecords(): Promise<BoxingRecordRow[]> {
  return apiFetch<BoxingRecordRow[]>('/packing-lite-boxing-records/')
}

export function recordBoxingOutput(
  payload: RecordBoxingOutputPayload,
): Promise<BoxingRecordRow> {
  return apiFetch<BoxingRecordRow>('/packing-lite-boxing-records/', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function setWorkCentreStatus(
  id: number,
  status: WorkCentreOperationalStatus,
): Promise<WorkCentreRow> {
  return apiFetch<WorkCentreRow>(`/packing-lite-work-centres/${id}/status/`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })
}

export function getDayReconciliation(): Promise<DayReconciliation> {
  return apiFetch<DayReconciliation>('/packing-lite-day-reconciliation/')
}

export function closeToday(): Promise<{ date: string; closed_at: string }> {
  return apiFetch('/packing-lite-close-today/', { method: 'POST' })
}
