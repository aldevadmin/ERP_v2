import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useNavigate, useParams } from 'react-router'
import ProductFormPage from './ProductFormPage'
import * as productsApi from './api'
import type { Product } from './types'

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return { ...actual, useNavigate: vi.fn(), useParams: vi.fn() }
})
vi.mock('./api')

const mockedApi = vi.mocked(productsApi)
const mockedUseNavigate = vi.mocked(useNavigate)
const mockedUseParams = vi.mocked(useParams)
const navigateMock = vi.fn()

beforeEach(() => {
  mockedUseNavigate.mockReturnValue(navigateMock)
  mockedUseParams.mockReturnValue({})
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('ProductFormPage — create', () => {
  it('submits a new product', async () => {
    const created: Product = {
      id: 10,
      sku_code: 'NEW1',
      name: 'New Product',
      description: '',
      base_unit: 'Piece',
      is_active: true,
    }
    mockedApi.createProduct.mockResolvedValue(created)

    render(
      <MemoryRouter>
        <ProductFormPage />
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByLabelText('SKU Code'), { target: { value: 'NEW1' } })
    fireEvent.change(screen.getByLabelText('Product Name'), { target: { value: 'New Product' } })
    fireEvent.change(screen.getByLabelText('Base Unit'), { target: { value: 'Piece' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(mockedApi.createProduct).toHaveBeenCalledWith(
        expect.objectContaining({ sku_code: 'NEW1', name: 'New Product', base_unit: 'Piece' }),
      ),
    )
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/products'))
  })
})

describe('ProductFormPage — edit', () => {
  it('loads the existing product and submits an update', async () => {
    mockedUseParams.mockReturnValue({ id: '5' })
    const existing: Product = {
      id: 5,
      sku_code: 'EXIST',
      name: 'Existing Product',
      description: 'A description',
      base_unit: 'Piece',
      is_active: true,
    }
    mockedApi.getProduct.mockResolvedValue(existing)
    mockedApi.updateProduct.mockResolvedValue(existing)

    render(
      <MemoryRouter>
        <ProductFormPage />
      </MemoryRouter>,
    )

    expect(await screen.findByDisplayValue('Existing Product')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(mockedApi.updateProduct).toHaveBeenCalledWith(5, expect.any(Object)),
    )
  })
})
