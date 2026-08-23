import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import PackagingProfileListPage from './PackagingProfileListPage'
import { ApiError } from '../../shared/api/http'
import * as api from './api'
import type { PackagingProfileListResponse } from './types'

vi.mock('./api')

const mockedApi = vi.mocked(api)

afterEach(() => {
  vi.clearAllMocks()
})

const response: PackagingProfileListResponse = {
  count: 1,
  next: null,
  previous: null,
  results: [
    {
      id: 1,
      code: 'PKG-1',
      name: 'Standard Packing',
      finished_item: 1,
      finished_item_name: '10 Inch Plate',
      scope: 'STANDARD',
      is_active: true,
      current_version: {
        id: 1,
        profile: 1,
        profile_name: 'Standard Packing',
        version_number: 1,
        status: 'DRAFT',
        effective_from: null,
        effective_to: null,
        selling_uom: null,
        selling_uom_code: '',
        pack_mode: 'CARTON',
        pieces_per_pouch: null,
        pouches_per_carton: null,
        carton_length_mm: null,
        carton_breadth_mm: null,
        carton_height_mm: null,
        carton_net_weight_kg: null,
        carton_gross_weight_kg: null,
        pieces_per_selling_unit: null,
        cbm: null,
        materials: [],
      },
    },
  ],
}

describe('PackagingProfileListPage', () => {
  it('renders profiles from the API', async () => {
    mockedApi.listPackagingProfiles.mockResolvedValue(response)

    render(
      <MemoryRouter>
        <PackagingProfileListPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Standard Packing')).toBeInTheDocument()
    expect(screen.getByText('v1 — DRAFT')).toBeInTheDocument()
  })

  it('deletes a profile after confirmation', async () => {
    mockedApi.listPackagingProfiles.mockResolvedValue(response)
    mockedApi.deletePackagingProfile.mockResolvedValue(undefined)

    render(
      <MemoryRouter>
        <PackagingProfileListPage />
      </MemoryRouter>,
    )
    await screen.findByText('Standard Packing')

    fireEvent.click(screen.getByLabelText('Delete Standard Packing'))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(mockedApi.deletePackagingProfile).toHaveBeenCalledWith(1))
  })

  it('shows the backend error when a profile is still in use', async () => {
    mockedApi.listPackagingProfiles.mockResolvedValue(response)
    mockedApi.deletePackagingProfile.mockRejectedValue(
      new ApiError('Cannot delete — referenced by 1 customer mapping.', 400),
    )

    render(
      <MemoryRouter>
        <PackagingProfileListPage />
      </MemoryRouter>,
    )
    await screen.findByText('Standard Packing')

    fireEvent.click(screen.getByLabelText('Delete Standard Packing'))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))

    expect(
      await screen.findByText('Cannot delete — referenced by 1 customer mapping.'),
    ).toBeInTheDocument()
  })
})
