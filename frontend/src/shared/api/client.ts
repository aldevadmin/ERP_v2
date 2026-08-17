import { apiFetch } from './http'

export interface HealthResponse {
  status: 'ok' | 'error'
  service: string
  database: 'ok' | 'error'
}

export function fetchHealth(): Promise<HealthResponse> {
  return apiFetch<HealthResponse>('/health/')
}
