import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import StorageLocationListPage from './StorageLocationListPage'
import { ApiError } from '../../shared/api/http'
import * as api from './api'
import type { StorageLocationListResponse } from './types'

vi.mock('./api')

const mockedApi = vi.mocked(api)

afterEach(() => {
  vi.clearAllMocks()
})

const response: StorageLocationListResponse = {
  count: 1,
  next: null,
  previous: null,
  results: [{ id: 1, name: 'Reject Store', is_active: true }],
}

describe('StorageLocationListPage', () => {
  it('renders locations from the API', async () => {
    mockedApi.listStorageLocations.mockResolvedValue(response)

    render(
      <MemoryRouter>
        <StorageLocationListPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Reject Store')).toBeInTheDocument()
    expect(mockedApi.listStorageLocations).toHaveBeenCalledWith({
      search: undefined,
      isActive: true,
    })
  })

  it('deletes a location after confirmation', async () => {
    mockedApi.listStorageLocations.mockResolvedValue(response)
    mockedApi.deleteStorageLocation.mockResolvedValue(undefined)

    render(
      <MemoryRouter>
        <StorageLocationListPage />
      </MemoryRouter>,
    )
    await screen.findByText('Reject Store')

    fireEvent.click(screen.getByLabelText('Delete Reject Store'))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(mockedApi.deleteStorageLocation).toHaveBeenCalledWith(1))
  })

  it('shows the backend error when a location is still in use', async () => {
    mockedApi.listStorageLocations.mockResolvedValue(response)
    mockedApi.deleteStorageLocation.mockRejectedValue(
      new ApiError('Cannot delete — used in Product Route "Areca Plate".', 400),
    )

    render(
      <MemoryRouter>
        <StorageLocationListPage />
      </MemoryRouter>,
    )
    await screen.findByText('Reject Store')

    fireEvent.click(screen.getByLabelText('Delete Reject Store'))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))

    expect(
      await screen.findByText('Cannot delete — used in Product Route "Areca Plate".'),
    ).toBeInTheDocument()
  })
})
