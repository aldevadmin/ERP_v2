import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useParams } from 'react-router'
import ItemFormPage from './ItemFormPage'
import * as api from './api'
import * as customerMappingsApi from '../customer-mappings/api'
import type {
  MaterialTypeListResponse,
  ProductTypeListResponse,
  UOMListResponse,
} from './types'

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return { ...actual, useParams: vi.fn(() => ({})) }
})
vi.mock('./api')
vi.mock('../customer-mappings/api')

const mockedApi = vi.mocked(api)
const mockedCustomerMappingsApi = vi.mocked(customerMappingsApi)
const mockedUseParams = vi.mocked(useParams)

afterEach(() => {
  vi.clearAllMocks()
})

const productTypes: ProductTypeListResponse = {
  count: 1,
  next: null,
  previous: null,
  results: [{ id: 1, name: 'Plate', is_active: true }],
}
const materialTypes: MaterialTypeListResponse = {
  count: 1,
  next: null,
  previous: null,
  results: [{ id: 2, name: 'Areca Palm', is_active: true }],
}
const uoms: UOMListResponse = {
  count: 1,
  next: null,
  previous: null,
  results: [{ id: 3, code: 'PC', name: 'Piece', decimal_scale: 0, is_active: true }],
}

function setup() {
  mockedApi.listProductTypes.mockResolvedValue(productTypes)
  mockedApi.listMaterialTypes.mockResolvedValue(materialTypes)
  mockedApi.listUOMs.mockResolvedValue(uoms)
}

describe('ItemFormPage', () => {
  it('shows Product Type for the default Finished Good class', async () => {
    setup()

    render(
      <MemoryRouter>
        <ItemFormPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Product Type')).toBeInTheDocument()
    expect(screen.getByText('Material')).toBeInTheDocument()
  })

  it('hides Product Type when Raw Material is selected', async () => {
    setup()

    render(
      <MemoryRouter>
        <ItemFormPage />
      </MemoryRouter>,
    )
    await screen.findByText('Product Type')

    fireEvent.click(screen.getByRole('radio', { name: 'Raw Material' }))

    await waitFor(() => expect(screen.queryByText('Product Type')).not.toBeInTheDocument())
    expect(screen.getByText('Material')).toBeInTheDocument()
  })

  it('creates an item with the entered values', async () => {
    setup()
    mockedApi.createItem.mockResolvedValue({
      id: 10,
      code: 'CON-002',
      name: 'Packing Tape',
      description: '',
      item_class: 'CONSUMABLE',
      product_type: null,
      product_type_name: '',
      material_type: null,
      material_type_name: '',
      inventory_uom: 3,
      inventory_uom_code: 'PC',
      purchasable: false,
      manufacturable: false,
      stockable: false,
      sellable: false,
      lot_tracking: 'NONE',
      is_active: true,
      available_qty: 0,
    })

    render(
      <MemoryRouter>
        <ItemFormPage />
      </MemoryRouter>,
    )
    await screen.findByText('Product Type')

    fireEvent.click(screen.getByRole('radio', { name: 'Consumable' }))

    fireEvent.change(screen.getByLabelText('What should this item be called?'), {
      target: { value: 'Packing Tape' },
    })
    fireEvent.change(screen.getByLabelText('Item Code'), { target: { value: 'CON-002' } })

    fireEvent.mouseDown(screen.getByLabelText('Inventory Unit'))
    fireEvent.click(await screen.findByTitle('Piece (PC)'))

    fireEvent.click(screen.getByRole('button', { name: 'Create Item' }))

    await waitFor(() => expect(mockedApi.createItem).toHaveBeenCalled())
    const submitted = mockedApi.createItem.mock.calls[0][0]
    expect(submitted.name).toBe('Packing Tape')
    expect(submitted.code).toBe('CON-002')
    expect(submitted.inventory_uom).toBe(3)
  })
})

describe('ItemFormPage — edit mode', () => {
  it('renders mapped customers as a reverse projection', async () => {
    setup()
    mockedUseParams.mockReturnValue({ id: '7' })
    mockedApi.getItem.mockResolvedValue({
      id: 7,
      code: 'SQ10',
      name: '10 Inch Plate',
      description: '',
      item_class: 'FINISHED_GOOD',
      product_type: 1,
      product_type_name: 'Plate',
      material_type: 2,
      material_type_name: 'Areca Palm',
      inventory_uom: 3,
      inventory_uom_code: 'PC',
      purchasable: false,
      manufacturable: true,
      stockable: true,
      sellable: true,
      lot_tracking: 'NONE',
      is_active: true,
      available_qty: 0,
    })
    mockedCustomerMappingsApi.listCustomerProductMappings.mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          id: 5,
          customer: 1,
          customer_name: 'Acme Exports',
          item: 7,
          item_name: '10 Inch Plate',
          item_code: 'SQ10',
          customer_sku: 'SKU-A',
          mapping_code: 'CPM-1',
          is_active: true,
          current_version: {
            id: 1,
            mapping: 5,
            mapping_code: 'CPM-1',
            customer_name: 'Acme Exports',
            item_name: '10 Inch Plate',
            item_code: 'SQ10',
            version_number: 1,
            status: 'PUBLISHED',
            effective_from: null,
            effective_to: null,
            customer_sku: 'SKU-A',
            customer_description: '',
            packaging_profile_version: null,
            packaging_profile_name: '',
            packaging_profile_version_number: null,
            selling_uom: null,
            selling_uom_code: '',
            unit_price: null,
            currency: '',
            barcode: '',
            requirements: [],
            files: [],
          },
        },
      ],
    })

    render(
      <MemoryRouter>
        <ItemFormPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Acme Exports')).toBeInTheDocument()
    expect(screen.getByText('SKU-A')).toBeInTheDocument()
    expect(screen.getByText('v1 — PUBLISHED')).toBeInTheDocument()
  })
})
