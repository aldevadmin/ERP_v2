import { apiFetch } from '../../shared/api/http'
import type {
  CustomerSKUMapping,
  CustomerSKUMappingFile,
  CustomerSKUMappingFileCategory,
  CustomerSKUMappingFileListResponse,
  CustomerSKUMappingFormValues,
  CustomerSKUMappingListResponse,
  Product,
  ProductFormValues,
  ProductListResponse,
} from './types'

export interface ListProductsParams {
  search?: string
  isActive?: boolean
}

export function listProducts(params: ListProductsParams = {}): Promise<ProductListResponse> {
  const query = new URLSearchParams()
  if (params.search) query.set('search', params.search)
  if (params.isActive !== undefined) query.set('is_active', String(params.isActive))
  const queryString = query.toString()
  return apiFetch<ProductListResponse>(`/products/${queryString ? `?${queryString}` : ''}`)
}

export function getProduct(id: number): Promise<Product> {
  return apiFetch<Product>(`/products/${id}/`)
}

export function createProduct(values: ProductFormValues): Promise<Product> {
  return apiFetch<Product>('/products/', { method: 'POST', body: JSON.stringify(values) })
}

export function updateProduct(id: number, values: ProductFormValues): Promise<Product> {
  return apiFetch<Product>(`/products/${id}/`, { method: 'PATCH', body: JSON.stringify(values) })
}

export interface ListMappingsParams {
  customer?: number
  search?: string
}

export function listCustomerSkuMappings(
  params: ListMappingsParams = {},
): Promise<CustomerSKUMappingListResponse> {
  const query = new URLSearchParams()
  if (params.customer) query.set('customer', String(params.customer))
  if (params.search) query.set('search', params.search)
  const queryString = query.toString()
  return apiFetch<CustomerSKUMappingListResponse>(
    `/customer-sku-mappings/${queryString ? `?${queryString}` : ''}`,
  )
}

export function getCustomerSkuMapping(id: number): Promise<CustomerSKUMapping> {
  return apiFetch<CustomerSKUMapping>(`/customer-sku-mappings/${id}/`)
}

export function createCustomerSkuMapping(
  values: CustomerSKUMappingFormValues,
): Promise<CustomerSKUMapping> {
  return apiFetch<CustomerSKUMapping>('/customer-sku-mappings/', {
    method: 'POST',
    body: JSON.stringify(values),
  })
}

export function updateCustomerSkuMapping(
  id: number,
  values: CustomerSKUMappingFormValues,
): Promise<CustomerSKUMapping> {
  return apiFetch<CustomerSKUMapping>(`/customer-sku-mappings/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(values),
  })
}

export function deleteCustomerSkuMapping(id: number): Promise<void> {
  return apiFetch<void>(`/customer-sku-mappings/${id}/`, { method: 'DELETE' })
}

export function listCustomerSkuMappingFiles(
  mappingId: number,
  category?: CustomerSKUMappingFileCategory,
): Promise<CustomerSKUMappingFileListResponse> {
  const query = category ? `?category=${category}` : ''
  return apiFetch<CustomerSKUMappingFileListResponse>(
    `/customer-sku-mappings/${mappingId}/files/${query}`,
  )
}

export function uploadCustomerSkuMappingFile(
  mappingId: number,
  category: CustomerSKUMappingFileCategory,
  file: File,
): Promise<CustomerSKUMappingFile> {
  const formData = new FormData()
  formData.append('category', category)
  formData.append('file', file)
  return apiFetch<CustomerSKUMappingFile>(`/customer-sku-mappings/${mappingId}/files/`, {
    method: 'POST',
    body: formData,
  })
}

export function deleteCustomerSkuMappingFile(mappingId: number, fileId: number): Promise<void> {
  return apiFetch<void>(`/customer-sku-mappings/${mappingId}/files/${fileId}/`, {
    method: 'DELETE',
  })
}
