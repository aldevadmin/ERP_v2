import { apiFetch } from '../../shared/api/http'
import type {
  ActivationResultV1,
  ProcessInputV1,
  ProcessInputV1FormValues,
  ProcessOutputV1,
  ProcessOutputV1FormValues,
  ProcessV1,
  ProcessV1BasicsValues,
  ProcessV1ListResponse,
  VersionStatusV1,
} from './types'

interface RawProcessVersionV1 {
  id: number
  version_number: number
  status: VersionStatusV1
  category: number
  category_name: string
  description: string
  inputs: ProcessInputV1[]
  outputs: ProcessOutputV1[]
}

interface RawProcessDefinitionV1 {
  id: number
  name: string
  code: string
  is_active: boolean
  current_version: RawProcessVersionV1 | null
}

interface RawProcessV1ListResponse {
  count: number
  next: string | null
  previous: string | null
  results: RawProcessDefinitionV1[]
}

function flattenProcess(raw: RawProcessDefinitionV1): ProcessV1 {
  const version = raw.current_version
  return {
    id: raw.id,
    name: raw.name,
    code: raw.code,
    is_active: raw.is_active,
    version_id: version?.id ?? 0,
    version_number: version?.version_number ?? 0,
    version_status: version?.status ?? 'DRAFT',
    category: version?.category ?? 0,
    category_name: version?.category_name ?? '',
    description: version?.description ?? '',
    inputs: version?.inputs ?? [],
    outputs: version?.outputs ?? [],
  }
}

export interface ListProcessesV1Params {
  search?: string
  isActive?: boolean
  category?: number
}

export function listProcessesV1(
  params: ListProcessesV1Params = {},
): Promise<ProcessV1ListResponse> {
  const query = new URLSearchParams()
  if (params.search) query.set('search', params.search)
  if (params.isActive !== undefined) query.set('is_active', String(params.isActive))
  if (params.category !== undefined) query.set('category', String(params.category))
  const queryString = query.toString()
  return apiFetch<RawProcessV1ListResponse>(
    `/process-definitions-v1/${queryString ? `?${queryString}` : ''}`,
  ).then((response) => ({ ...response, results: response.results.map(flattenProcess) }))
}

export function getProcessV1(id: number): Promise<ProcessV1> {
  return apiFetch<RawProcessDefinitionV1>(`/process-definitions-v1/${id}/`).then(flattenProcess)
}

export function createProcessV1(values: ProcessV1BasicsValues): Promise<ProcessV1> {
  return apiFetch<RawProcessDefinitionV1>('/process-definitions-v1/', {
    method: 'POST',
    body: JSON.stringify(values),
  }).then(flattenProcess)
}

export function updateProcessV1(
  id: number,
  values: Partial<ProcessV1BasicsValues> & { is_active?: boolean },
): Promise<ProcessV1> {
  return apiFetch<RawProcessDefinitionV1>(`/process-definitions-v1/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(values),
  }).then(flattenProcess)
}

export function duplicateProcessV1(id: number): Promise<ProcessV1> {
  return apiFetch<RawProcessDefinitionV1>(`/process-definitions-v1/${id}/duplicate/`, {
    method: 'POST',
  }).then(flattenProcess)
}

export function deleteProcessV1(id: number): Promise<void> {
  return apiFetch<void>(`/process-definitions-v1/${id}/`, { method: 'DELETE' })
}

export interface SaveProcessInputsV1Payload {
  inputs: ProcessInputV1FormValues[]
}

export function saveProcessInputsV1(
  versionId: number,
  payload: SaveProcessInputsV1Payload,
): Promise<ProcessInputV1[]> {
  return apiFetch<RawProcessVersionV1>(`/process-definition-versions-v1/${versionId}/inputs/`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }).then((version) => version.inputs)
}

export interface SaveProcessOutputsV1Payload {
  outputs: ProcessOutputV1FormValues[]
}

export function saveProcessOutputsV1(
  versionId: number,
  payload: SaveProcessOutputsV1Payload,
): Promise<ProcessOutputV1[]> {
  return apiFetch<RawProcessVersionV1>(`/process-definition-versions-v1/${versionId}/outputs/`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }).then((version) => version.outputs)
}

export function activateProcessV1(versionId: number): Promise<ActivationResultV1> {
  return apiFetch<RawProcessVersionV1>(
    `/process-definition-versions-v1/${versionId}/activate/`,
    { method: 'POST' },
  ).then((version) => ({ version_status: version.status }))
}
