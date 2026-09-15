import { apiFetch } from '../../shared/api/http'
import type {
  ProcessRouteV1,
  ProcessRouteV1ListResponse,
  ProcessRouteVersionV1,
  RouteBasicsV1Values,
  RouteEdgeV1,
  RouteEdgeV1FormValues,
  RouteItemMappingV1,
  RouteItemMappingV1FormValues,
  RouteNodeV1,
  RouteNodeV1FormValues,
  RouteVersionStatusV1,
} from './types'

// The backend models a route as a ProcessRouteV1 (stable identity) plus a
// ProcessRouteVersionV1 (what's actually configured) — same split as
// apps.product_routes, flattened here the same way that module's own
// api.ts does.
interface RawProcessRouteVersionV1 {
  id: number
  version_number: number
  status: RouteVersionStatusV1
  is_default: boolean
  effective_from: string | null
  effective_to: string | null
  item_group: number
  item_group_name: string
  route_name: string
  nodes: RouteNodeV1[]
  edges: RouteEdgeV1[]
  item_mappings: RouteItemMappingV1[]
}

interface RawProcessRouteV1 {
  id: number
  name: string
  is_active: boolean
  current_version: RawProcessRouteVersionV1 | null
}

interface RawProcessRouteV1ListResponse {
  count: number
  next: string | null
  previous: string | null
  results: RawProcessRouteV1[]
}

function flattenRoute(raw: RawProcessRouteV1): ProcessRouteV1 {
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
    item_group: version?.item_group ?? 0,
    item_group_name: version?.item_group_name ?? '',
    nodes: version?.nodes ?? [],
    edges: version?.edges ?? [],
    item_mappings: version?.item_mappings ?? [],
  }
}

export interface ListProcessRoutesV1Params {
  search?: string
  itemGroup?: number
  isActive?: boolean
}

export function listProcessRoutesV1(
  params: ListProcessRoutesV1Params = {},
): Promise<ProcessRouteV1ListResponse> {
  const query = new URLSearchParams()
  if (params.search) query.set('search', params.search)
  if (params.itemGroup !== undefined) query.set('item_group', String(params.itemGroup))
  if (params.isActive !== undefined) query.set('is_active', String(params.isActive))
  const queryString = query.toString()
  return apiFetch<RawProcessRouteV1ListResponse>(
    `/product-routes-v1/${queryString ? `?${queryString}` : ''}`,
  ).then((response) => ({ ...response, results: response.results.map(flattenRoute) }))
}

export function getProcessRouteV1(id: number): Promise<ProcessRouteV1> {
  return apiFetch<RawProcessRouteV1>(`/product-routes-v1/${id}/`).then(flattenRoute)
}

export function createProcessRouteV1(values: RouteBasicsV1Values): Promise<ProcessRouteV1> {
  return apiFetch<RawProcessRouteV1>('/product-routes-v1/', {
    method: 'POST',
    body: JSON.stringify(values),
  }).then(flattenRoute)
}

export function updateProcessRouteV1(
  id: number,
  values: Partial<Pick<RouteBasicsV1Values, 'name'>> & { is_active?: boolean },
): Promise<ProcessRouteV1> {
  return apiFetch<RawProcessRouteV1>(`/product-routes-v1/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(values),
  }).then(flattenRoute)
}

export function duplicateProcessRouteV1(id: number): Promise<ProcessRouteV1> {
  return apiFetch<RawProcessRouteV1>(`/product-routes-v1/${id}/duplicate/`, {
    method: 'POST',
  }).then(flattenRoute)
}

export function deleteProcessRouteV1(id: number): Promise<void> {
  return apiFetch<void>(`/product-routes-v1/${id}/`, { method: 'DELETE' })
}

export interface RouteVersionV1FormValues {
  is_default: boolean
  effective_from: string | null
}

export function saveRouteVersionV1(
  versionId: number,
  values: Partial<RouteVersionV1FormValues>,
): Promise<RouteVersionV1FormValues> {
  return apiFetch<RawProcessRouteVersionV1>(`/product-route-versions-v1/${versionId}/`, {
    method: 'PATCH',
    body: JSON.stringify(values),
  }).then((version) => ({
    is_default: version.is_default,
    effective_from: version.effective_from,
  }))
}

export function saveRouteNodesV1(
  versionId: number,
  payload: { nodes: RouteNodeV1FormValues[] },
): Promise<ProcessRouteVersionV1> {
  return apiFetch<RawProcessRouteVersionV1>(`/product-route-versions-v1/${versionId}/nodes/`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export function saveRouteEdgesV1(
  versionId: number,
  payload: { edges: RouteEdgeV1FormValues[] },
): Promise<ProcessRouteVersionV1> {
  return apiFetch<RawProcessRouteVersionV1>(`/product-route-versions-v1/${versionId}/edges/`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export function saveRouteItemMappingsV1(
  versionId: number,
  payload: { item_mappings: RouteItemMappingV1FormValues[] },
): Promise<ProcessRouteVersionV1> {
  return apiFetch<RawProcessRouteVersionV1>(
    `/product-route-versions-v1/${versionId}/item_mappings/`,
    { method: 'PATCH', body: JSON.stringify(payload) },
  )
}

export interface ActivateRouteV1Result {
  version_status: RouteVersionStatusV1
}

export function activateRouteVersionV1(versionId: number): Promise<ActivateRouteV1Result> {
  return apiFetch<RawProcessRouteVersionV1>(
    `/product-route-versions-v1/${versionId}/activate/`,
    { method: 'POST' },
  ).then((version) => ({ version_status: version.status }))
}
