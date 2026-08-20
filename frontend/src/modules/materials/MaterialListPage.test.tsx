import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import MaterialListPage from './MaterialListPage'
import * as materialsApi from './api'
import type { MaterialListResponse } from './types'

vi.mock('./api')

const mockedApi = vi.mocked(materialsApi)

afterEach(() => {
  vi.clearAllMocks()
})

const response: MaterialListResponse = {
  count: 1,
  next: null,
  previous: null,
  results: [
    { id: 1, code: 'MAT-1', name: 'Raw Leaf', unit: 'Kg', category: 'RAW_MATERIAL', is_active: true },
  ],
}

describe('MaterialListPage', () => {
  it('renders materials from the API', async () => {
    mockedApi.listMaterials.mockResolvedValue(response)

    render(
      <MemoryRouter>
        <MaterialListPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Raw Leaf')).toBeInTheDocument()
    expect(screen.getByText('MAT-1')).toBeInTheDocument()
    expect(mockedApi.listMaterials).toHaveBeenCalledWith({ search: undefined, isActive: true })
  })

  it('requests every material once "Active only" is turned off', async () => {
    mockedApi.listMaterials.mockResolvedValue(response)

    render(
      <MemoryRouter>
        <MaterialListPage />
      </MemoryRouter>,
    )
    await screen.findByText('Raw Leaf')

    fireEvent.click(screen.getByRole('switch'))

    await waitFor(() =>
      expect(mockedApi.listMaterials).toHaveBeenLastCalledWith({
        search: undefined,
        isActive: undefined,
      }),
    )
  })
})
