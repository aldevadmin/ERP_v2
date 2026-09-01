import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import ItemListPage from './ItemListPage'
import { ApiError } from '../../shared/api/http'
import * as api from './api'
import type { Item, ItemListResponse, MaterialTypeListResponse, ProductTypeListResponse } from './types'

vi.mock('./api')

const mockedApi = vi.mocked(api)

afterEach(() => {
  vi.clearAllMocks()
})

const emptyProductTypes: ProductTypeListResponse = { count: 0, next: null, previous: null, results: [] }
const emptyMaterialTypes: MaterialTypeListResponse = {
  count: 0,
  next: null,
  previous: null,
  results: [],
}

const baseItem: Item = {
  id: 1,
  code: 'FG-001',
  name: 'Areca Plate 10in',
  description: '',
  item_class: 'FINISHED_GOOD',
  product_type: 1,
  product_type_name: 'Plate',
  material_type: 1,
  material_type_name: 'Areca Palm',
  shape: null,
  shape_name: '',
  length: null,
  breadth: null,
  height: null,
  length_uom: null,
  breadth_uom: null,
  height_uom: null,
  inventory_uom: 1,
  inventory_uom_code: 'PC',
  purchasable: false,
  manufacturable: true,
  stockable: true,
  sellable: true,
  lot_tracking: 'NONE',
  is_active: true,
  available_qty: 0,
}

function itemsResponse(items: Item[]): ItemListResponse {
  return { count: items.length, next: null, previous: null, results: items }
}

function setup(items: Item[] = [baseItem]) {
  mockedApi.listProductTypes.mockResolvedValue(emptyProductTypes)
  mockedApi.listMaterialTypes.mockResolvedValue(emptyMaterialTypes)
  mockedApi.listItems.mockResolvedValue(itemsResponse(items))
}

describe('ItemListPage', () => {
  it('renders items with derived usage tags', async () => {
    setup()

    render(
      <MemoryRouter>
        <ItemListPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Areca Plate 10in')).toBeInTheDocument()
    expect(screen.getByText('Made')).toBeInTheDocument()
    expect(screen.getByText('Stocked')).toBeInTheDocument()
    expect(screen.getByText('Sold')).toBeInTheDocument()
    expect(screen.queryByText('Bought')).not.toBeInTheDocument()
  })

  it('filters by item class when a tab is selected', async () => {
    setup()

    render(
      <MemoryRouter>
        <ItemListPage />
      </MemoryRouter>,
    )
    await screen.findByText('Areca Plate 10in')

    fireEvent.click(screen.getByRole('tab', { name: 'Raw Material' }))

    await waitFor(() =>
      expect(mockedApi.listItems).toHaveBeenLastCalledWith(
        expect.objectContaining({ itemClass: 'RAW_MATERIAL' }),
      ),
    )
  })

  it('deletes an item after confirmation', async () => {
    setup()
    mockedApi.deleteItem.mockResolvedValue(undefined)

    render(
      <MemoryRouter>
        <ItemListPage />
      </MemoryRouter>,
    )
    await screen.findByText('Areca Plate 10in')

    fireEvent.click(screen.getByLabelText('Delete Areca Plate 10in'))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(mockedApi.deleteItem).toHaveBeenCalledWith(1))
  })

  it('shows the backend error when an item is still in use', async () => {
    setup()
    mockedApi.deleteItem.mockRejectedValue(
      new ApiError('Cannot delete — referenced by 1 process input(s).', 400),
    )

    render(
      <MemoryRouter>
        <ItemListPage />
      </MemoryRouter>,
    )
    await screen.findByText('Areca Plate 10in')

    fireEvent.click(screen.getByLabelText('Delete Areca Plate 10in'))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))

    expect(
      await screen.findByText('Cannot delete — referenced by 1 process input(s).'),
    ).toBeInTheDocument()
  })
})
