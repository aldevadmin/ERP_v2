import { apiFetch } from '../../shared/api/http'
import type { WorkCentrePositionFormValues } from '../tooling/types'
import type {
  Bay,
  BayFormValues,
  BayListResponse,
  WorkCentre,
  WorkCentreCapabilityFormValues,
  WorkCentreFormValues,
  WorkCentreListResponse,
  WorkCentreType,
  WorkCentreTypeFormValues,
  WorkCentreTypeListResponse,
} from './types'

export interface ListBaysParams {
  search?: string
  isActive?: boolean
}

export function listBays(params: ListBaysParams = {}): Promise<BayListResponse> {
  const query = new URLSearchParams()
  if (params.search) query.set('search', params.search)
  if (params.isActive !== undefined) query.set('is_active', String(params.isActive))
  const queryString = query.toString()
  return apiFetch<BayListResponse>(`/bays/${queryString ? `?${queryString}` : ''}`)
}

export function getBay(id: number): Promise<Bay> {
  return apiFetch<Bay>(`/bays/${id}/`)
}

export function createBay(values: BayFormValues): Promise<Bay> {
  return apiFetch<Bay>('/bays/', { method: 'POST', body: JSON.stringify(values) })
}

export function updateBay(id: number, values: Partial<BayFormValues>): Promise<Bay> {
  return apiFetch<Bay>(`/bays/${id}/`, { method: 'PATCH', body: JSON.stringify(values) })
}

export function deleteBay(id: number): Promise<void> {
  return apiFetch<void>(`/bays/${id}/`, { method: 'DELETE' })
}

export interface ListWorkCentresParams {
  search?: string
  isActive?: boolean
  type?: number
}

export interface ListWorkCentreTypesParams {
  search?: string
  isActive?: boolean
}

export function listWorkCentreTypes(
  params: ListWorkCentreTypesParams = {},
): Promise<WorkCentreTypeListResponse> {
  const query = new URLSearchParams()
  if (params.search) query.set('search', params.search)
  if (params.isActive !== undefined) query.set('is_active', String(params.isActive))
  const queryString = query.toString()
  return apiFetch<WorkCentreTypeListResponse>(
    `/work-centre-types/${queryString ? `?${queryString}` : ''}`,
  )
}

export function getWorkCentreType(id: number): Promise<WorkCentreType> {
  return apiFetch<WorkCentreType>(`/work-centre-types/${id}/`)
}

export function createWorkCentreType(values: WorkCentreTypeFormValues): Promise<WorkCentreType> {
  return apiFetch<WorkCentreType>('/work-centre-types/', {
    method: 'POST',
    body: JSON.stringify(values),
  })
}

export function updateWorkCentreType(
  id: number,
  values: WorkCentreTypeFormValues,
): Promise<WorkCentreType> {
  return apiFetch<WorkCentreType>(`/work-centre-types/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(values),
  })
}

export function deleteWorkCentreType(id: number): Promise<void> {
  return apiFetch<void>(`/work-centre-types/${id}/`, { method: 'DELETE' })
}

export function listWorkCentres(
  params: ListWorkCentresParams = {},
): Promise<WorkCentreListResponse> {
  const query = new URLSearchParams()
  if (params.search) query.set('search', params.search)
  if (params.isActive !== undefined) query.set('is_active', String(params.isActive))
  if (params.type !== undefined) query.set('type', String(params.type))
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

export function deleteWorkCentre(id: number): Promise<void> {
  return apiFetch<void>(`/work-centres/${id}/`, { method: 'DELETE' })
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

export interface SaveWorkCentrePositionsPayload {
  positions: WorkCentrePositionFormValues[]
}

export function saveWorkCentrePositions(
  workCentreId: number,
  payload: SaveWorkCentrePositionsPayload,
): Promise<WorkCentre> {
  return apiFetch<WorkCentre>(`/work-centres/${workCentreId}/positions/`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}
