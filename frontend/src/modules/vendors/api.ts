import { apiFetch } from '../../shared/api/http'
import type { VendorListResponse } from './types'

export interface ListVendorsParams {
  search?: string
}

export function listVendors(params: ListVendorsParams = {}): Promise<VendorListResponse> {
  const query = new URLSearchParams()
  if (params.search) query.set('search', params.search)
  const queryString = query.toString()
  return apiFetch<VendorListResponse>(`/vendors/${queryString ? `?${queryString}` : ''}`)
}
