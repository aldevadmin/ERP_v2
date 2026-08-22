import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import ProcessCategoryListPage from './ProcessCategoryListPage'
import { ApiError } from '../../shared/api/http'
import * as processesApi from './api'
import type { ProcessCategoryListResponse } from './types'

vi.mock('./api')

const mockedApi = vi.mocked(processesApi)

afterEach(() => {
  vi.clearAllMocks()
})

const response: ProcessCategoryListResponse = {
  count: 1,
  next: null,
  previous: null,
  results: [{ id: 1, name: 'Production', is_active: true }],
}

describe('ProcessCategoryListPage', () => {
  it('renders categories from the API', async () => {
    mockedApi.listProcessCategories.mockResolvedValue(response)

    render(
      <MemoryRouter>
        <ProcessCategoryListPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Production')).toBeInTheDocument()
    expect(mockedApi.listProcessCategories).toHaveBeenCalledWith({
      search: undefined,
      isActive: true,
    })
  })

  it('requests every category once "Active only" is turned off', async () => {
    mockedApi.listProcessCategories.mockResolvedValue(response)

    render(
      <MemoryRouter>
        <ProcessCategoryListPage />
      </MemoryRouter>,
    )
    await screen.findByText('Production')

    fireEvent.click(screen.getByRole('switch'))

    await waitFor(() =>
      expect(mockedApi.listProcessCategories).toHaveBeenLastCalledWith({
        search: undefined,
        isActive: undefined,
      }),
    )
  })

  it('deletes a category after confirmation', async () => {
    mockedApi.listProcessCategories.mockResolvedValue(response)
    mockedApi.deleteProcessCategory.mockResolvedValue(undefined)

    render(
      <MemoryRouter>
        <ProcessCategoryListPage />
      </MemoryRouter>,
    )
    await screen.findByText('Production')

    fireEvent.click(screen.getByLabelText('Delete Production'))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(mockedApi.deleteProcessCategory).toHaveBeenCalledWith(1))
  })

  it('shows the backend error when a category is still in use', async () => {
    mockedApi.listProcessCategories.mockResolvedValue(response)
    mockedApi.deleteProcessCategory.mockRejectedValue(
      new ApiError('Cannot delete — used by 1 Process(es).', 400),
    )

    render(
      <MemoryRouter>
        <ProcessCategoryListPage />
      </MemoryRouter>,
    )
    await screen.findByText('Production')

    fireEvent.click(screen.getByLabelText('Delete Production'))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))

    expect(await screen.findByText('Cannot delete — used by 1 Process(es).')).toBeInTheDocument()
  })
})
