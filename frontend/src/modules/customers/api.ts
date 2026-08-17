import { apiFetch } from '../../shared/api/http'
import type { Customer, CustomerFormValues, CustomerListResponse } from './types'

export interface ListCustomersParams {
  search?: string
  isActive?: boolean
}

export function listCustomers(params: ListCustomersParams = {}): Promise<CustomerListResponse> {
  const query = new URLSearchParams()
  if (params.search) query.set('search', params.search)
  if (params.isActive !== undefined) query.set('is_active', String(params.isActive))
  const queryString = query.toString()
  return apiFetch<CustomerListResponse>(`/customers/${queryString ? `?${queryString}` : ''}`)
}

export function getCustomer(id: number): Promise<Customer> {
  return apiFetch<Customer>(`/customers/${id}/`)
}

export function createCustomer(values: CustomerFormValues): Promise<Customer> {
  return apiFetch<Customer>('/customers/', {
    method: 'POST',
    body: JSON.stringify(values),
  })
}

export function updateCustomer(id: number, values: CustomerFormValues): Promise<Customer> {
  return apiFetch<Customer>(`/customers/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(values),
  })
}
