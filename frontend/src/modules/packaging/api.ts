import { apiFetch } from '../../shared/api/http'
import type {
  PackagingMaterialRow,
  PackagingProfile,
  PackagingProfileFormValues,
  PackagingProfileListResponse,
  PackagingProfileMaterialUsageListResponse,
  PackagingProfileVersion,
  PackagingProfileVersionFormValues,
} from './types'

export interface ListPackagingProfilesParams {
  search?: string
  isActive?: boolean
  scope?: string
  finishedItem?: number
}

export function listPackagingProfiles(
  params: ListPackagingProfilesParams = {},
): Promise<PackagingProfileListResponse> {
  const query = new URLSearchParams()
  if (params.search) query.set('search', params.search)
  if (params.isActive !== undefined) query.set('is_active', String(params.isActive))
  if (params.scope) query.set('scope', params.scope)
  if (params.finishedItem !== undefined) query.set('finished_item', String(params.finishedItem))
  const queryString = query.toString()
  return apiFetch<PackagingProfileListResponse>(
    `/packaging-profiles/${queryString ? `?${queryString}` : ''}`,
  )
}

export function getPackagingProfile(id: number): Promise<PackagingProfile> {
  return apiFetch<PackagingProfile>(`/packaging-profiles/${id}/`)
}

export function createPackagingProfile(
  values: PackagingProfileFormValues,
): Promise<PackagingProfile> {
  return apiFetch<PackagingProfile>('/packaging-profiles/', {
    method: 'POST',
    body: JSON.stringify(values),
  })
}

export function updatePackagingProfile(
  id: number,
  values: Partial<PackagingProfileFormValues>,
): Promise<PackagingProfile> {
  return apiFetch<PackagingProfile>(`/packaging-profiles/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(values),
  })
}

export function deletePackagingProfile(id: number): Promise<void> {
  return apiFetch<void>(`/packaging-profiles/${id}/`, { method: 'DELETE' })
}

// Reverse lookup for the Item form's "Used In Packaging Profiles" card —
// every profile version that lists the given Packaging Material item.
export function listPackagingProfileMaterialUsage(
  itemId: number,
): Promise<PackagingProfileMaterialUsageListResponse> {
  return apiFetch<PackagingProfileMaterialUsageListResponse>(
    `/packaging-profile-materials/?item=${itemId}`,
  )
}

export function getPackagingProfileVersion(id: number): Promise<PackagingProfileVersion> {
  return apiFetch<PackagingProfileVersion>(`/packaging-profile-versions/${id}/`)
}

export function updatePackagingProfileVersion(
  id: number,
  values: Partial<PackagingProfileVersionFormValues>,
): Promise<PackagingProfileVersion> {
  return apiFetch<PackagingProfileVersion>(`/packaging-profile-versions/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(values),
  })
}

export function savePackagingMaterials(
  versionId: number,
  materials: PackagingMaterialRow[],
): Promise<PackagingProfileVersion> {
  return apiFetch<PackagingProfileVersion>(`/packaging-profile-versions/${versionId}/materials/`, {
    method: 'PATCH',
    body: JSON.stringify({ materials }),
  })
}

export function publishPackagingProfileVersion(id: number): Promise<PackagingProfileVersion> {
  return apiFetch<PackagingProfileVersion>(`/packaging-profile-versions/${id}/publish/`, {
    method: 'POST',
  })
}

export function newPackagingProfileDraft(id: number): Promise<PackagingProfileVersion> {
  return apiFetch<PackagingProfileVersion>(`/packaging-profile-versions/${id}/new-draft/`, {
    method: 'POST',
  })
}
