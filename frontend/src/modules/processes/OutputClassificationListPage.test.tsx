import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import OutputClassificationListPage from './OutputClassificationListPage'
import { ApiError } from '../../shared/api/http'
import * as processesApi from './api'
import type { OutputClassificationListResponse } from './types'

vi.mock('./api')

const mockedApi = vi.mocked(processesApi)

afterEach(() => {
  vi.clearAllMocks()
})

const response: OutputClassificationListResponse = {
  count: 1,
  next: null,
  previous: null,
  results: [{ id: 1, name: 'Premium', is_active: true }],
}

describe('OutputClassificationListPage', () => {
  it('renders classifications from the API', async () => {
    mockedApi.listOutputClassifications.mockResolvedValue(response)

    render(
      <MemoryRouter>
        <OutputClassificationListPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Premium')).toBeInTheDocument()
    expect(mockedApi.listOutputClassifications).toHaveBeenCalledWith({
      search: undefined,
      isActive: true,
    })
  })

  it('requests every classification once "Active only" is turned off', async () => {
    mockedApi.listOutputClassifications.mockResolvedValue(response)

    render(
      <MemoryRouter>
        <OutputClassificationListPage />
      </MemoryRouter>,
    )
    await screen.findByText('Premium')

    fireEvent.click(screen.getByRole('switch'))

    await waitFor(() =>
      expect(mockedApi.listOutputClassifications).toHaveBeenLastCalledWith({
        search: undefined,
        isActive: undefined,
      }),
    )
  })

  it('deletes a classification after confirmation', async () => {
    mockedApi.listOutputClassifications.mockResolvedValue(response)
    mockedApi.deleteOutputClassification.mockResolvedValue(undefined)

    render(
      <MemoryRouter>
        <OutputClassificationListPage />
      </MemoryRouter>,
    )
    await screen.findByText('Premium')

    fireEvent.click(screen.getByLabelText('Delete Premium'))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(mockedApi.deleteOutputClassification).toHaveBeenCalledWith(1))
  })

  it('shows the backend error when a classification is still in use', async () => {
    mockedApi.listOutputClassifications.mockResolvedValue(response)
    mockedApi.deleteOutputClassification.mockRejectedValue(
      new ApiError('Cannot delete — used by 1 output(s).', 400),
    )

    render(
      <MemoryRouter>
        <OutputClassificationListPage />
      </MemoryRouter>,
    )
    await screen.findByText('Premium')

    fireEvent.click(screen.getByLabelText('Delete Premium'))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))

    expect(await screen.findByText('Cannot delete — used by 1 output(s).')).toBeInTheDocument()
  })
})
