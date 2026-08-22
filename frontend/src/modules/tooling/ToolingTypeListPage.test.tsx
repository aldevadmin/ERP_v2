import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import ToolingTypeListPage from './ToolingTypeListPage'
import { ApiError } from '../../shared/api/http'
import * as api from './api'
import type { ToolingTypeListResponse } from './types'

vi.mock('./api')

const mockedApi = vi.mocked(api)

afterEach(() => {
  vi.clearAllMocks()
})

const response: ToolingTypeListResponse = {
  count: 1,
  next: null,
  previous: null,
  results: [{ id: 1, name: 'Mould', is_active: true }],
}

describe('ToolingTypeListPage', () => {
  it('renders types from the API', async () => {
    mockedApi.listToolingTypes.mockResolvedValue(response)

    render(
      <MemoryRouter>
        <ToolingTypeListPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Mould')).toBeInTheDocument()
    expect(mockedApi.listToolingTypes).toHaveBeenCalledWith({
      search: undefined,
      isActive: true,
    })
  })

  it('deletes a type after confirmation', async () => {
    mockedApi.listToolingTypes.mockResolvedValue(response)
    mockedApi.deleteToolingType.mockResolvedValue(undefined)

    render(
      <MemoryRouter>
        <ToolingTypeListPage />
      </MemoryRouter>,
    )
    await screen.findByText('Mould')

    fireEvent.click(screen.getByLabelText('Delete Mould'))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(mockedApi.deleteToolingType).toHaveBeenCalledWith(1))
  })

  it('shows the backend error when a type is still in use', async () => {
    mockedApi.listToolingTypes.mockResolvedValue(response)
    mockedApi.deleteToolingType.mockRejectedValue(
      new ApiError('Cannot delete — referenced by 1 tooling.', 400),
    )

    render(
      <MemoryRouter>
        <ToolingTypeListPage />
      </MemoryRouter>,
    )
    await screen.findByText('Mould')

    fireEvent.click(screen.getByLabelText('Delete Mould'))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))

    expect(
      await screen.findByText('Cannot delete — referenced by 1 tooling.'),
    ).toBeInTheDocument()
  })
})
