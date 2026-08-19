import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import ProcessCategoryListPage from './ProcessCategoryListPage'
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
})
