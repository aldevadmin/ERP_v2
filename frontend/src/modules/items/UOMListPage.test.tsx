import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import UOMListPage from './UOMListPage'
import { ApiError } from '../../shared/api/http'
import * as api from './api'
import type { UOMListResponse } from './types'

vi.mock('./api')

const mockedApi = vi.mocked(api)

afterEach(() => {
  vi.clearAllMocks()
})

const response: UOMListResponse = {
  count: 1,
  next: null,
  previous: null,
  results: [{ id: 1, code: 'KG', name: 'Kilogram', decimal_scale: 3, is_active: true }],
}

describe('UOMListPage', () => {
  it('renders units from the API', async () => {
    mockedApi.listUOMs.mockResolvedValue(response)

    render(
      <MemoryRouter>
        <UOMListPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Kilogram')).toBeInTheDocument()
    expect(screen.getByText('KG')).toBeInTheDocument()
    expect(mockedApi.listUOMs).toHaveBeenCalledWith({ search: undefined, isActive: true })
  })

  it('deletes a unit after confirmation', async () => {
    mockedApi.listUOMs.mockResolvedValue(response)
    mockedApi.deleteUOM.mockResolvedValue(undefined)

    render(
      <MemoryRouter>
        <UOMListPage />
      </MemoryRouter>,
    )
    await screen.findByText('Kilogram')

    fireEvent.click(screen.getByLabelText('Delete Kilogram'))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(mockedApi.deleteUOM).toHaveBeenCalledWith(1))
  })

  it('shows the backend error when a unit is still in use', async () => {
    mockedApi.listUOMs.mockResolvedValue(response)
    mockedApi.deleteUOM.mockRejectedValue(new ApiError('Cannot delete — used by 1 item(s).', 400))

    render(
      <MemoryRouter>
        <UOMListPage />
      </MemoryRouter>,
    )
    await screen.findByText('Kilogram')

    fireEvent.click(screen.getByLabelText('Delete Kilogram'))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))

    expect(await screen.findByText('Cannot delete — used by 1 item(s).')).toBeInTheDocument()
  })
})
