import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import WorkCentreTypeListPage from './WorkCentreTypeListPage'
import { ApiError } from '../../shared/api/http'
import * as api from './api'
import type { WorkCentreTypeListResponse } from './types'

vi.mock('./api')

const mockedApi = vi.mocked(api)

afterEach(() => {
  vi.clearAllMocks()
})

const response: WorkCentreTypeListResponse = {
  count: 1,
  next: null,
  previous: null,
  results: [{ id: 1, name: 'Machine', is_active: true }],
}

describe('WorkCentreTypeListPage', () => {
  it('renders types from the API', async () => {
    mockedApi.listWorkCentreTypes.mockResolvedValue(response)

    render(
      <MemoryRouter>
        <WorkCentreTypeListPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Machine')).toBeInTheDocument()
    expect(mockedApi.listWorkCentreTypes).toHaveBeenCalledWith({
      search: undefined,
      isActive: true,
    })
  })

  it('deletes a type after confirmation', async () => {
    mockedApi.listWorkCentreTypes.mockResolvedValue(response)
    mockedApi.deleteWorkCentreType.mockResolvedValue(undefined)

    render(
      <MemoryRouter>
        <WorkCentreTypeListPage />
      </MemoryRouter>,
    )
    await screen.findByText('Machine')

    fireEvent.click(screen.getByLabelText('Delete Machine'))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(mockedApi.deleteWorkCentreType).toHaveBeenCalledWith(1))
  })

  it('shows the backend error when a type is still in use', async () => {
    mockedApi.listWorkCentreTypes.mockResolvedValue(response)
    mockedApi.deleteWorkCentreType.mockRejectedValue(
      new ApiError('Cannot delete — referenced by 1 work centres.', 400),
    )

    render(
      <MemoryRouter>
        <WorkCentreTypeListPage />
      </MemoryRouter>,
    )
    await screen.findByText('Machine')

    fireEvent.click(screen.getByLabelText('Delete Machine'))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))

    expect(
      await screen.findByText('Cannot delete — referenced by 1 work centres.'),
    ).toBeInTheDocument()
  })
})
