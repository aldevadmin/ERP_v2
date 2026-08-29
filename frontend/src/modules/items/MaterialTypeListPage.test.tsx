import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import MaterialTypeListPage from './MaterialTypeListPage'
import { ApiError } from '../../shared/api/http'
import * as api from './api'
import type { MaterialTypeListResponse } from './types'

vi.mock('./api')

const mockedApi = vi.mocked(api)

afterEach(() => {
  vi.clearAllMocks()
})

const response: MaterialTypeListResponse = {
  count: 1,
  next: null,
  previous: null,
  results: [
    { id: 1, name: 'Areca Palm', short_code: 'AL', applicable_item_classes: [], is_active: true },
  ],
}

describe('MaterialTypeListPage', () => {
  it('renders material types from the API', async () => {
    mockedApi.listMaterialTypes.mockResolvedValue(response)

    render(
      <MemoryRouter>
        <MaterialTypeListPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Areca Palm')).toBeInTheDocument()
    expect(mockedApi.listMaterialTypes).toHaveBeenCalledWith({ search: undefined, isActive: true })
  })

  it('deletes a material type after confirmation', async () => {
    mockedApi.listMaterialTypes.mockResolvedValue(response)
    mockedApi.deleteMaterialType.mockResolvedValue(undefined)

    render(
      <MemoryRouter>
        <MaterialTypeListPage />
      </MemoryRouter>,
    )
    await screen.findByText('Areca Palm')

    fireEvent.click(screen.getByLabelText('Delete Areca Palm'))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(mockedApi.deleteMaterialType).toHaveBeenCalledWith(1))
  })

  it('shows the backend error when a material type is still in use', async () => {
    mockedApi.listMaterialTypes.mockResolvedValue(response)
    mockedApi.deleteMaterialType.mockRejectedValue(
      new ApiError('Cannot delete — used by 1 item(s).', 400),
    )

    render(
      <MemoryRouter>
        <MaterialTypeListPage />
      </MemoryRouter>,
    )
    await screen.findByText('Areca Palm')

    fireEvent.click(screen.getByLabelText('Delete Areca Palm'))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))

    expect(await screen.findByText('Cannot delete — used by 1 item(s).')).toBeInTheDocument()
  })
})
