import { apiFetch } from '../../shared/api/http'
import type {
  ProcessRoute,
  ProcessRouteListResponse,
  ProcessRouteVersion,
  RouteBasicsValues,
  RouteEdge,
  RouteEdgeFormValues,
  RouteNode,
  RouteNodeFormValues,
  RouteVersionStatus,
  StorageLocation,
  StorageLocationFormValues,
  StorageLocationListResponse,
} from './types'

export interface ListStorageLocationsParams {
  search?: string
  isActive?: boolean
}

export function listStorageLocations(
  params: ListStorageLocationsParams = {},
): Promise<StorageLocationListResponse> {
  const query = new URLSearchParams()
  if (params.search) query.set('search', params.search)
  if (params.isActive !== undefined) query.set('is_active', String(params.isActive))
  const queryString = query.toString()
  return apiFetch<StorageLocationListResponse>(
    `/storage-locations/${queryString ? `?${queryString}` : ''}`,
  )
}

export function getStorageLocation(id: number): Promise<StorageLocation> {
  return apiFetch<StorageLocation>(`/storage-locations/${id}/`)
}

export function createStorageLocation(
  values: StorageLocationFormValues,
): Promise<StorageLocation> {
  return apiFetch<StorageLocation>('/storage-locations/', {
    method: 'POST',
    body: JSON.stringify(values),
  })
}

export function updateStorageLocation(
  id: number,
  values: StorageLocationFormValues,
): Promise<StorageLocation> {
  return apiFetch<StorageLocation>(`/storage-locations/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(values),
  })
}

export function deleteStorageLocation(id: number): Promise<void> {
  return apiFetch<void>(`/storage-locations/${id}/`, { method: 'DELETE' })
}

// The backend models a route as a ProcessRoute (stable identity) plus a
// ProcessRouteVersion (what's actually configured) — same split as
// Process/ProcessDefinitionVersion. This module flattens the two into one
// `ProcessRoute` shape, mirroring `frontend/src/modules/processes/api.ts`.
interface RawProcessRouteVersion {
  id: number
  version_number: number
  status: RouteVersionStatus
  is_default: boolean
  effective_from: string | null
  effective_to: string | null
  product: number
  product_name: string
  route_name: string
  nodes: RouteNode[]
  edges: RouteEdge[]
}

interface RawProcessRoute {
  id: number
  name: string
  is_active: boolean
  current_version: RawProcessRouteVersion | null
}

interface RawProcessRouteListResponse {
  count: number
  next: string | null
  previous: string | null
  results: RawProcessRoute[]
}

function flattenRoute(raw: RawProcessRoute): ProcessRoute {
  const version = raw.current_version
  return {
    id: raw.id,
    name: raw.name,
    is_active: raw.is_active,
    version_id: version?.id ?? 0,
    version_number: version?.version_number ?? 0,
    version_status: version?.status ?? 'DRAFT',
    is_default: version?.is_default ?? false,
    effective_from: version?.effective_from ?? null,
    effective_to: version?.effective_to ?? null,
    product: version?.product ?? 0,
    product_name: version?.product_name ?? '',
    nodes: version?.nodes ?? [],
    edges: version?.edges ?? [],
  }
}

export interface ListProcessRoutesParams {
  search?: string
  product?: number
  isActive?: boolean
}

export function listProcessRoutes(
  params: ListProcessRoutesParams = {},
): Promise<ProcessRouteListResponse> {
  const query = new URLSearchParams()
  if (params.search) query.set('search', params.search)
  if (params.product !== undefined) query.set('product', String(params.product))
  if (params.isActive !== undefined) query.set('is_active', String(params.isActive))
  const queryString = query.toString()
  return apiFetch<RawProcessRouteListResponse>(
    `/product-routes/${queryString ? `?${queryString}` : ''}`,
  ).then((response) => ({ ...response, results: response.results.map(flattenRoute) }))
}

export function getProcessRoute(id: number): Promise<ProcessRoute> {
  return apiFetch<RawProcessRoute>(`/product-routes/${id}/`).then(flattenRoute)
}

export function createProcessRoute(values: RouteBasicsValues): Promise<ProcessRoute> {
  return apiFetch<RawProcessRoute>('/product-routes/', {
    method: 'POST',
    body: JSON.stringify(values),
  }).then(flattenRoute)
}

export function updateProcessRoute(
  id: number,
  values: Partial<Pick<RouteBasicsValues, 'name'>> & { is_active?: boolean },
): Promise<ProcessRoute> {
  return apiFetch<RawProcessRoute>(`/product-routes/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(values),
  }).then(flattenRoute)
}

export function duplicateProcessRoute(id: number): Promise<ProcessRoute> {
  return apiFetch<RawProcessRoute>(`/product-routes/${id}/duplicate/`, {
    method: 'POST',
  }).then(flattenRoute)
}

export function deleteProcessRoute(id: number): Promise<void> {
  return apiFetch<void>(`/product-routes/${id}/`, { method: 'DELETE' })
}

export interface RouteVersionFormValues {
  is_default: boolean
  effective_from: string | null
}

export function saveRouteVersion(
  versionId: number,
  values: Partial<RouteVersionFormValues>,
): Promise<RouteVersionFormValues> {
  return apiFetch<RawProcessRouteVersion>(`/product-route-versions/${versionId}/`, {
    method: 'PATCH',
    body: JSON.stringify(values),
  }).then((version) => ({
    is_default: version.is_default,
    effective_from: version.effective_from,
  }))
}

export function saveRouteNodes(
  versionId: number,
  payload: { nodes: RouteNodeFormValues[] },
): Promise<ProcessRouteVersion> {
  return apiFetch<RawProcessRouteVersion>(`/product-route-versions/${versionId}/nodes/`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export function saveRouteEdges(
  versionId: number,
  payload: { edges: RouteEdgeFormValues[] },
): Promise<ProcessRouteVersion> {
  return apiFetch<RawProcessRouteVersion>(`/product-route-versions/${versionId}/edges/`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export interface ActivateRouteResult {
  version_status: RouteVersionStatus
}

export function activateRouteVersion(versionId: number): Promise<ActivateRouteResult> {
  return apiFetch<RawProcessRouteVersion>(`/product-route-versions/${versionId}/activate/`, {
    method: 'POST',
  }).then((version) => ({ version_status: version.status }))
}
