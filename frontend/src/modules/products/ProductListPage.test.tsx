import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import ProductListPage from './ProductListPage'
import * as productsApi from './api'
import type { ProductListResponse } from './types'

vi.mock('./api')

const mockedApi = vi.mocked(productsApi)

afterEach(() => {
  vi.clearAllMocks()
})

const response: ProductListResponse = {
  count: 1,
  next: null,
  previous: null,
  results: [
    {
      id: 1,
      sku_code: 'SKU-1',
      name: 'Areca Plate',
      description: '',
      base_unit: 'Piece',
      stage: 'FINISHED_GOOD',
      is_active: true,
    },
  ],
}

describe('ProductListPage', () => {
  it('renders products from the API', async () => {
    mockedApi.listProducts.mockResolvedValue(response)

    render(
      <MemoryRouter>
        <ProductListPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Areca Plate')).toBeInTheDocument()
    expect(screen.getByText('SKU-1')).toBeInTheDocument()
    expect(mockedApi.listProducts).toHaveBeenCalledWith({ search: undefined, isActive: true })
  })

  it('requests every product once "Active only" is turned off', async () => {
    mockedApi.listProducts.mockResolvedValue(response)

    render(
      <MemoryRouter>
        <ProductListPage />
      </MemoryRouter>,
    )
    await screen.findByText('Areca Plate')

    fireEvent.click(screen.getByRole('switch'))

    await waitFor(() =>
      expect(mockedApi.listProducts).toHaveBeenLastCalledWith({
        search: undefined,
        isActive: undefined,
      }),
    )
  })
})
