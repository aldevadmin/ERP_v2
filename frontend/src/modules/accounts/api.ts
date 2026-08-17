import { apiFetch } from '../../shared/api/http'
import type { EmployeeListResponse, TeamListResponse } from './types'

export interface ListEmployeesParams {
  search?: string
  role?: string
}

export function listEmployees(params: ListEmployeesParams = {}): Promise<EmployeeListResponse> {
  const query = new URLSearchParams()
  if (params.search) query.set('search', params.search)
  if (params.role) query.set('role', params.role)
  const queryString = query.toString()
  return apiFetch<EmployeeListResponse>(`/employees/${queryString ? `?${queryString}` : ''}`)
}

export function listTeams(): Promise<TeamListResponse> {
  return apiFetch<TeamListResponse>('/teams/')
}
