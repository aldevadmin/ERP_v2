import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useNavigate, useParams } from 'react-router'
import ProductRouteFormPage from './ProductRouteFormPage'
import * as productRoutesApi from './api'
import * as productsApi from '../products/api'
import type { ProcessRoute } from './types'
import type { ProductListResponse } from '../products/types'

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return { ...actual, useNavigate: vi.fn(), useParams: vi.fn() }
})
vi.mock('./api')
vi.mock('../products/api')

const mockedApi = vi.mocked(productRoutesApi)
const mockedProductsApi = vi.mocked(productsApi)
const mockedUseNavigate = vi.mocked(useNavigate)
const mockedUseParams = vi.mocked(useParams)
const navigateMock = vi.fn()

const productsResponse: ProductListResponse = {
  count: 1,
  next: null,
  previous: null,
  results: [
    {
      id: 1,
      sku_code: 'PLATE-10',
      name: '10" Round Areca Plate',
      description: '',
      base_unit: 'Piece',
      stage: 'FINISHED_GOOD',
      is_active: true,
    },
  ],
}

beforeEach(() => {
  mockedUseNavigate.mockReturnValue(navigateMock)
  mockedUseParams.mockReturnValue({})
  mockedProductsApi.listProducts.mockResolvedValue(productsResponse)
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('ProductRouteFormPage — wizard shell', () => {
  it('shows all 4 steps and a prompt for Steps before Basics is saved', async () => {
    render(
      <MemoryRouter>
        <ProductRouteFormPage />
      </MemoryRouter>,
    )

    for (const label of ['Basics', 'Steps', 'Output Routing', 'Review']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }

    fireEvent.click(screen.getByText('Steps'))

    expect(
      await screen.findByText('Save Basics first to configure Steps.'),
    ).toBeInTheDocument()
  })
})

describe('ProductRouteFormPage — Basics', () => {
  it('creates the route and moves to the Steps editor on Continue', async () => {
    const created: ProcessRoute = {
      id: 1,
      name: 'Standard Plate Production',
      is_active: true,
      version_id: 10,
      version_number: 1,
      version_status: 'DRAFT',
      is_default: true,
      effective_from: null,
      effective_to: null,
      product: 1,
      product_name: '10" Round Areca Plate',
      nodes: [],
      edges: [],
    }
    mockedApi.createProcessRoute.mockResolvedValue(created)

    render(
      <MemoryRouter>
        <ProductRouteFormPage />
      </MemoryRouter>,
    )
    await screen.findByText('10" Round Areca Plate (PLATE-10)')

    fireEvent.change(screen.getByLabelText('Route Name'), {
      target: { value: 'Standard Plate Production' },
    })
    fireEvent.click(screen.getByLabelText('10" Round Areca Plate (PLATE-10)'))
    fireEvent.click(screen.getByLabelText('Yes'))

    fireEvent.click(screen.getByRole('button', { name: 'Save & Continue →' }))

    await waitFor(() =>
      expect(mockedApi.createProcessRoute).toHaveBeenCalledWith({
        name: 'Standard Plate Production',
        product: 1,
        is_default: true,
        effective_from: null,
      }),
    )
    expect(
      await screen.findByText('How is "10" Round Areca Plate" processed?'),
    ).toBeInTheDocument()
    expect(navigateMock).not.toHaveBeenCalled()
  })
})
