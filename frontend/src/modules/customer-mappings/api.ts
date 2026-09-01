import { apiFetch } from '../../shared/api/http'
import type {
  CustomerProductMapping,
  CustomerProductMappingFormValues,
  CustomerProductMappingListResponse,
  CustomerProductMappingVersion,
  CustomerProductMappingVersionFormValues,
  MappingFile,
  MappingFileCategory,
  MappingRequirementRow,
} from './types'

export interface ListMappingsParams {
  search?: string
  isActive?: boolean
  customer?: number
  item?: number
  packagingProfile?: number
}

export function listCustomerProductMappings(
  params: ListMappingsParams = {},
): Promise<CustomerProductMappingListResponse> {
  const query = new URLSearchParams()
  if (params.search) query.set('search', params.search)
  if (params.isActive !== undefined) query.set('is_active', String(params.isActive))
  if (params.customer !== undefined) query.set('customer', String(params.customer))
  if (params.item !== undefined) query.set('item', String(params.item))
  if (params.packagingProfile !== undefined) {
    query.set('packaging_profile', String(params.packagingProfile))
  }
  const queryString = query.toString()
  return apiFetch<CustomerProductMappingListResponse>(
    `/customer-product-mappings/${queryString ? `?${queryString}` : ''}`,
  )
}

export function getCustomerProductMapping(id: number): Promise<CustomerProductMapping> {
  return apiFetch<CustomerProductMapping>(`/customer-product-mappings/${id}/`)
}

export function createCustomerProductMapping(
  values: CustomerProductMappingFormValues,
): Promise<CustomerProductMapping> {
  return apiFetch<CustomerProductMapping>('/customer-product-mappings/', {
    method: 'POST',
    body: JSON.stringify(values),
  })
}

export function updateCustomerProductMapping(
  id: number,
  values: Partial<CustomerProductMappingFormValues>,
): Promise<CustomerProductMapping> {
  return apiFetch<CustomerProductMapping>(`/customer-product-mappings/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(values),
  })
}

export function deleteCustomerProductMapping(id: number): Promise<void> {
  return apiFetch<void>(`/customer-product-mappings/${id}/`, { method: 'DELETE' })
}

export function resolveCustomerProduct(
  customer: number,
  item: number,
  asOf?: string,
): Promise<CustomerProductMappingVersion> {
  const query = new URLSearchParams({ customer: String(customer), item: String(item) })
  if (asOf) query.set('as_of', asOf)
  return apiFetch<CustomerProductMappingVersion>(`/customer-product-mappings/resolve/?${query.toString()}`)
}

export function getCustomerProductMappingVersion(id: number): Promise<CustomerProductMappingVersion> {
  return apiFetch<CustomerProductMappingVersion>(`/customer-product-mapping-versions/${id}/`)
}

export function updateCustomerProductMappingVersion(
  id: number,
  values: Partial<CustomerProductMappingVersionFormValues>,
): Promise<CustomerProductMappingVersion> {
  return apiFetch<CustomerProductMappingVersion>(`/customer-product-mapping-versions/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(values),
  })
}

export function saveMappingRequirements(
  versionId: number,
  requirements: MappingRequirementRow[],
): Promise<CustomerProductMappingVersion> {
  return apiFetch<CustomerProductMappingVersion>(
    `/customer-product-mapping-versions/${versionId}/requirements/`,
    { method: 'PATCH', body: JSON.stringify({ requirements }) },
  )
}

export function publishCustomerProductMappingVersion(
  id: number,
): Promise<CustomerProductMappingVersion> {
  return apiFetch<CustomerProductMappingVersion>(
    `/customer-product-mapping-versions/${id}/publish/`,
    { method: 'POST' },
  )
}

export function newCustomerProductMappingDraft(
  id: number,
): Promise<CustomerProductMappingVersion> {
  return apiFetch<CustomerProductMappingVersion>(
    `/customer-product-mapping-versions/${id}/new-draft/`,
    { method: 'POST' },
  )
}

export function uploadMappingFile(
  versionId: number,
  category: MappingFileCategory,
  file: File,
): Promise<MappingFile> {
  const formData = new FormData()
  formData.append('category', category)
  formData.append('file', file)
  return apiFetch<MappingFile>(`/customer-product-mapping-versions/${versionId}/files/`, {
    method: 'POST',
    body: formData,
  })
}

export function deleteMappingFile(versionId: number, fileId: number): Promise<void> {
  return apiFetch<void>(`/customer-product-mapping-versions/${versionId}/files/${fileId}/`, {
    method: 'DELETE',
  })
}
