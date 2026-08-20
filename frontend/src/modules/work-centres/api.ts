import { apiFetch } from '../../shared/api/http'
import type {
  WorkCentre,
  WorkCentreCapabilityFormValues,
  WorkCentreFormValues,
  WorkCentreListResponse,
  WorkCentreType,
} from './types'

export interface ListWorkCentresParams {
  search?: string
  isActive?: boolean
  type?: WorkCentreType
}

export function listWorkCentres(
  params: ListWorkCentresParams = {},
): Promise<WorkCentreListResponse> {
  const query = new URLSearchParams()
  if (params.search) query.set('search', params.search)
  if (params.isActive !== undefined) query.set('is_active', String(params.isActive))
  if (params.type) query.set('type', params.type)
  const queryString = query.toString()
  return apiFetch<WorkCentreListResponse>(`/work-centres/${queryString ? `?${queryString}` : ''}`)
}

export function getWorkCentre(id: number): Promise<WorkCentre> {
  return apiFetch<WorkCentre>(`/work-centres/${id}/`)
}

export function createWorkCentre(values: WorkCentreFormValues): Promise<WorkCentre> {
  return apiFetch<WorkCentre>('/work-centres/', { method: 'POST', body: JSON.stringify(values) })
}

export function updateWorkCentre(
  id: number,
  values: Partial<WorkCentreFormValues>,
): Promise<WorkCentre> {
  return apiFetch<WorkCentre>(`/work-centres/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(values),
  })
}

export interface SaveWorkCentreCapabilitiesPayload {
  capabilities: WorkCentreCapabilityFormValues[]
}

export function saveWorkCentreCapabilities(
  workCentreId: number,
  payload: SaveWorkCentreCapabilitiesPayload,
): Promise<WorkCentre> {
  return apiFetch<WorkCentre>(`/work-centres/${workCentreId}/capabilities/`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}
