import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useNavigate } from 'react-router'
import ProductRouteListPage from './ProductRouteListPage'
import * as productRoutesApi from './api'
import * as itemsApi from '../items/api'
import type { ProcessRoute, ProcessRouteListResponse } from './types'
import type { ItemListResponse } from '../items/types'

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return { ...actual, useNavigate: vi.fn() }
})
vi.mock('./api')
vi.mock('../items/api')

const mockedApi = vi.mocked(productRoutesApi)
const mockedItemsApi = vi.mocked(itemsApi)
const mockedUseNavigate = vi.mocked(useNavigate)
const navigateMock = vi.fn()

const route: ProcessRoute = {
  id: 1,
  name: 'Standard Plate Production',
  is_active: true,
  version_id: 10,
  version_number: 3,
  version_status: 'ACTIVE',
  is_default: true,
  effective_from: null,
  effective_to: null,
  item: 1,
  item_name: '10" Round Areca Plate',
  nodes: [
    {
      id: 1,
      node_key: 'washing',
      process_definition: 10,
      process_definition_name: 'Washing',
      display_label: '',
      sequence_hint: 1,
      is_optional: false,
      outputs: [],
    },
  ],
  edges: [],
}

const itemsResponse: ItemListResponse = {
  count: 1,
  next: null,
  previous: null,
  results: [
    {
      id: 1,
      code: 'PLATE-10',
      name: '10" Round Areca Plate',
      description: '',
      item_class: 'FINISHED_GOOD',
      product_type: null,
      product_type_name: '',
      material_type: null,
      material_type_name: '',
      shape: null,
      shape_name: '',
      length_in: null,
      breadth_in: null,
      height_mm: null,
      inventory_uom: null,
      inventory_uom_code: '',
      purchasable: false,
      manufacturable: true,
      stockable: true,
      sellable: true,
      lot_tracking: 'NONE',
      is_active: true,
      available_qty: 0,
    },
  ],
}

beforeEach(() => {
  mockedUseNavigate.mockReturnValue(navigateMock)
  mockedItemsApi.listItems.mockResolvedValue(itemsResponse)
})

afterEach(() => {
  vi.clearAllMocks()
})

function setupMocks(routes: ProcessRoute[] = [route]) {
  const response: ProcessRouteListResponse = {
    count: routes.length,
    next: null,
    previous: null,
    results: routes,
  }
  mockedApi.listProcessRoutes.mockResolvedValue(response)
}

describe('ProductRouteListPage', () => {
  it('renders routes with step count, version and default status', async () => {
    setupMocks()

    render(
      <MemoryRouter>
        <ProductRouteListPage />
      </MemoryRouter>,
    )

    const nameCell = await screen.findByText('Standard Plate Production')
    const row = nameCell.closest('tr')
    if (!row) throw new Error('row not found')

    expect(screen.getByText('10" Round Areca Plate')).toBeInTheDocument()
    expect(row).toHaveTextContent('v3')
  })

  it('duplicates a route and navigates to the new copy', async () => {
    setupMocks()
    const copy: ProcessRoute = { ...route, id: 2, name: 'Standard Plate Production (Copy)' }
    mockedApi.duplicateProcessRoute.mockResolvedValue(copy)

    render(
      <MemoryRouter>
        <ProductRouteListPage />
      </MemoryRouter>,
    )
    await screen.findByText('Standard Plate Production')

    fireEvent.click(screen.getByRole('button', { name: 'Actions — Standard Plate Production' }))
    fireEvent.click(await screen.findByText('Duplicate'))

    await waitFor(() => expect(mockedApi.duplicateProcessRoute).toHaveBeenCalledWith(1))
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/product-routes/2/edit'))
  })

  it('deactivates a route and refreshes the list', async () => {
    setupMocks()
    mockedApi.updateProcessRoute.mockResolvedValue({ ...route, is_active: false })

    render(
      <MemoryRouter>
        <ProductRouteListPage />
      </MemoryRouter>,
    )
    await screen.findByText('Standard Plate Production')

    fireEvent.click(screen.getByRole('button', { name: 'Actions — Standard Plate Production' }))
    fireEvent.click(await screen.findByText('Deactivate'))

    await waitFor(() =>
      expect(mockedApi.updateProcessRoute).toHaveBeenCalledWith(1, { is_active: false }),
    )
  })

  it('deletes a route after confirmation', async () => {
    setupMocks()
    mockedApi.deleteProcessRoute.mockResolvedValue(undefined)

    render(
      <MemoryRouter>
        <ProductRouteListPage />
      </MemoryRouter>,
    )
    await screen.findByText('Standard Plate Production')

    fireEvent.click(screen.getByRole('button', { name: 'Actions — Standard Plate Production' }))
    fireEvent.click(await screen.findByText('Delete'))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(mockedApi.deleteProcessRoute).toHaveBeenCalledWith(1))
  })
})
