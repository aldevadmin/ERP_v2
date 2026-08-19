import { apiFetch } from '../../shared/api/http'
import type {
  Process,
  ProcessCategory,
  ProcessCategoryFormValues,
  ProcessCategoryListResponse,
  ProcessFormValues,
  ProcessListResponse,
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
  return apiFetch<ProcessListResponse>(`/processes/${queryString ? `?${queryString}` : ''}`)
}

export function getProcess(id: number): Promise<Process> {
  return apiFetch<Process>(`/processes/${id}/`)
}

export function createProcess(values: ProcessFormValues): Promise<Process> {
  return apiFetch<Process>('/processes/', { method: 'POST', body: JSON.stringify(values) })
}

export function updateProcess(
  id: number,
  values: Partial<ProcessFormValues>,
): Promise<Process> {
  return apiFetch<Process>(`/processes/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(values),
  })
}

export function duplicateProcess(id: number): Promise<Process> {
  return apiFetch<Process>(`/processes/${id}/duplicate/`, { method: 'POST' })
}
