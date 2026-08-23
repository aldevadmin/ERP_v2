import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import ProductTypeListPage from './ProductTypeListPage'
import { ApiError } from '../../shared/api/http'
import * as api from './api'
import type { ProductTypeListResponse } from './types'

vi.mock('./api')

const mockedApi = vi.mocked(api)

afterEach(() => {
  vi.clearAllMocks()
})

const response: ProductTypeListResponse = {
  count: 1,
  next: null,
  previous: null,
  results: [{ id: 1, name: 'Plate', is_active: true }],
}

describe('ProductTypeListPage', () => {
  it('renders product types from the API', async () => {
    mockedApi.listProductTypes.mockResolvedValue(response)

    render(
      <MemoryRouter>
        <ProductTypeListPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Plate')).toBeInTheDocument()
    expect(mockedApi.listProductTypes).toHaveBeenCalledWith({ search: undefined, isActive: true })
  })

  it('deletes a product type after confirmation', async () => {
    mockedApi.listProductTypes.mockResolvedValue(response)
    mockedApi.deleteProductType.mockResolvedValue(undefined)

    render(
      <MemoryRouter>
        <ProductTypeListPage />
      </MemoryRouter>,
    )
    await screen.findByText('Plate')

    fireEvent.click(screen.getByLabelText('Delete Plate'))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(mockedApi.deleteProductType).toHaveBeenCalledWith(1))
  })

  it('shows the backend error when a product type is still in use', async () => {
    mockedApi.listProductTypes.mockResolvedValue(response)
    mockedApi.deleteProductType.mockRejectedValue(
      new ApiError('Cannot delete — used by 1 item(s).', 400),
    )

    render(
      <MemoryRouter>
        <ProductTypeListPage />
      </MemoryRouter>,
    )
    await screen.findByText('Plate')

    fireEvent.click(screen.getByLabelText('Delete Plate'))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))

    expect(await screen.findByText('Cannot delete — used by 1 item(s).')).toBeInTheDocument()
  })
})
