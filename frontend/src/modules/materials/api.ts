import { apiFetch } from '../../shared/api/http'
import type { Material, MaterialFormValues, MaterialListResponse } from './types'

export interface ListMaterialsParams {
  search?: string
  isActive?: boolean
}

export function listMaterials(params: ListMaterialsParams = {}): Promise<MaterialListResponse> {
  const query = new URLSearchParams()
  if (params.search) query.set('search', params.search)
  if (params.isActive !== undefined) query.set('is_active', String(params.isActive))
  const queryString = query.toString()
  return apiFetch<MaterialListResponse>(`/materials/${queryString ? `?${queryString}` : ''}`)
}

export function getMaterial(id: number): Promise<Material> {
  return apiFetch<Material>(`/materials/${id}/`)
}

export function createMaterial(values: MaterialFormValues): Promise<Material> {
  return apiFetch<Material>('/materials/', { method: 'POST', body: JSON.stringify(values) })
}

export function updateMaterial(id: number, values: MaterialFormValues): Promise<Material> {
  return apiFetch<Material>(`/materials/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(values),
  })
}
