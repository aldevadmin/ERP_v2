import { apiFetch } from '../../shared/api/http'
import type {
  Tooling,
  ToolingAssignment,
  ToolingAssignmentFormValues,
  ToolingCompatibilityFormValues,
  ToolingFormValues,
  ToolingListResponse,
  ToolingType,
  ToolingTypeFormValues,
  ToolingTypeListResponse,
} from './types'

export interface ListToolingParams {
  search?: string
  type?: number
  isActive?: boolean
  itemId?: number
}

export function listTooling(params: ListToolingParams = {}): Promise<ToolingListResponse> {
  const query = new URLSearchParams()
  if (params.search) query.set('search', params.search)
  if (params.type !== undefined) query.set('type', String(params.type))
  if (params.isActive !== undefined) query.set('is_active', String(params.isActive))
  if (params.itemId !== undefined) query.set('item_id', String(params.itemId))
  const queryString = query.toString()
  return apiFetch<ToolingListResponse>(`/tooling/${queryString ? `?${queryString}` : ''}`)
}

export interface ListToolingTypesParams {
  search?: string
  isActive?: boolean
}

export function listToolingTypes(
  params: ListToolingTypesParams = {},
): Promise<ToolingTypeListResponse> {
  const query = new URLSearchParams()
  if (params.search) query.set('search', params.search)
  if (params.isActive !== undefined) query.set('is_active', String(params.isActive))
  const queryString = query.toString()
  return apiFetch<ToolingTypeListResponse>(
    `/tooling-types/${queryString ? `?${queryString}` : ''}`,
  )
}

export function getToolingType(id: number): Promise<ToolingType> {
  return apiFetch<ToolingType>(`/tooling-types/${id}/`)
}

export function createToolingType(values: ToolingTypeFormValues): Promise<ToolingType> {
  return apiFetch<ToolingType>('/tooling-types/', {
    method: 'POST',
    body: JSON.stringify(values),
  })
}

export function updateToolingType(
  id: number,
  values: ToolingTypeFormValues,
): Promise<ToolingType> {
  return apiFetch<ToolingType>(`/tooling-types/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(values),
  })
}

export function deleteToolingType(id: number): Promise<void> {
  return apiFetch<void>(`/tooling-types/${id}/`, { method: 'DELETE' })
}

export function getTooling(id: number): Promise<Tooling> {
  return apiFetch<Tooling>(`/tooling/${id}/`)
}

export function createTooling(values: ToolingFormValues): Promise<Tooling> {
  return apiFetch<Tooling>('/tooling/', { method: 'POST', body: JSON.stringify(values) })
}

export function updateTooling(id: number, values: ToolingFormValues): Promise<Tooling> {
  return apiFetch<Tooling>(`/tooling/${id}/`, { method: 'PATCH', body: JSON.stringify(values) })
}

export function deleteTooling(id: number): Promise<void> {
  return apiFetch<void>(`/tooling/${id}/`, { method: 'DELETE' })
}

export interface SaveToolingCompatibilitiesPayload {
  compatibilities: ToolingCompatibilityFormValues[]
}

export function saveToolingCompatibilities(
  id: number,
  payload: SaveToolingCompatibilitiesPayload,
): Promise<Tooling> {
  return apiFetch<Tooling>(`/tooling/${id}/compatibilities/`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function listWorkCentrePositionAssignments(
  positionId: number,
): Promise<ToolingAssignment[]> {
  return apiFetch<ToolingAssignment[]>(`/work-centre-positions/${positionId}/assignments/`)
}

export function createToolingAssignment(
  positionId: number,
  values: ToolingAssignmentFormValues,
): Promise<ToolingAssignment> {
  return apiFetch<ToolingAssignment>(`/work-centre-positions/${positionId}/assignments/`, {
    method: 'POST',
    body: JSON.stringify(values),
  })
}

export function endToolingAssignment(assignmentId: number): Promise<ToolingAssignment> {
  return apiFetch<ToolingAssignment>(`/tooling-assignments/${assignmentId}/end/`, {
    method: 'POST',
  })
}
