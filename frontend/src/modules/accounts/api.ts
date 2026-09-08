import { apiFetch } from '../../shared/api/http'
import type { Employee, EmployeeFormValues, EmployeeListResponse, TeamListResponse } from './types'

export interface ListEmployeesParams {
  search?: string
  role?: string
  isActive?: boolean
}

export function listEmployees(params: ListEmployeesParams = {}): Promise<EmployeeListResponse> {
  const query = new URLSearchParams()
  if (params.search) query.set('search', params.search)
  if (params.role) query.set('role', params.role)
  if (params.isActive !== undefined) query.set('is_active', String(params.isActive))
  const queryString = query.toString()
  return apiFetch<EmployeeListResponse>(`/employees/${queryString ? `?${queryString}` : ''}`)
}

export function getEmployee(id: number): Promise<Employee> {
  return apiFetch<Employee>(`/employees/${id}/`)
}

export function createEmployee(values: EmployeeFormValues): Promise<Employee> {
  return apiFetch<Employee>('/employees/', { method: 'POST', body: JSON.stringify(values) })
}

export function updateEmployee(
  id: number,
  values: Partial<EmployeeFormValues>,
): Promise<Employee> {
  return apiFetch<Employee>(`/employees/${id}/`, { method: 'PATCH', body: JSON.stringify(values) })
}

export function deleteEmployee(id: number): Promise<void> {
  return apiFetch<void>(`/employees/${id}/`, { method: 'DELETE' })
}

export function listTeams(): Promise<TeamListResponse> {
  return apiFetch<TeamListResponse>('/teams/')
}
