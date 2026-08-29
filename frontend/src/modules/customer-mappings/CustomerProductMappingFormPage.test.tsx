import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useNavigate, useParams } from 'react-router'
import CustomerProductMappingFormPage from './CustomerProductMappingFormPage'
import * as mappingsApi from './api'
import * as customersApi from '../customers/api'
import * as itemsApi from '../items/api'
import * as packagingApi from '../packaging/api'
import type { CustomerProductMapping } from './types'
import type { CustomerListResponse } from '../customers/types'
import type { ItemListResponse, UOMListResponse } from '../items/types'
import type { PackagingProfileListResponse } from '../packaging/types'

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return { ...actual, useNavigate: vi.fn(), useParams: vi.fn() }
})
vi.mock('./api')
vi.mock('../customers/api')
vi.mock('../items/api')
vi.mock('../packaging/api')

const mockedApi = vi.mocked(mappingsApi)
const mockedCustomersApi = vi.mocked(customersApi)
const mockedItemsApi = vi.mocked(itemsApi)
const mockedPackagingApi = vi.mocked(packagingApi)
const mockedUseNavigate = vi.mocked(useNavigate)
const mockedUseParams = vi.mocked(useParams)
const navigateMock = vi.fn()

const customersResponse: CustomerListResponse = {
  count: 1,
  next: null,
  previous: null,
  results: [
    {
      id: 1,
      code: 'CUST-1',
      name: 'Acme Exports',
      main_poc: '',
      internal_coordinator: null,
      internal_coordinator_detail: null,
      is_active: true,
    },
  ],
}

const itemsResponse: ItemListResponse = {
  count: 1,
  next: null,
  previous: null,
  results: [
    {
      id: 1,
      code: 'SQ10',
      name: '10 Inch Plate',
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

const uomsResponse: UOMListResponse = {
  count: 0,
  next: null,
  previous: null,
  results: [],
}

const packagingResponse: PackagingProfileListResponse = {
  count: 0,
  next: null,
  previous: null,
  results: [],
}

beforeEach(() => {
  mockedUseNavigate.mockReturnValue(navigateMock)
  mockedUseParams.mockReturnValue({})
  mockedCustomersApi.listCustomers.mockResolvedValue(customersResponse)
  mockedItemsApi.listItems.mockResolvedValue(itemsResponse)
  mockedItemsApi.listUOMs.mockResolvedValue(uomsResponse)
  mockedPackagingApi.listPackagingProfiles.mockResolvedValue(packagingResponse)
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('CustomerProductMappingFormPage — wizard shell', () => {
  it('shows all 4 steps', async () => {
    render(
      <MemoryRouter>
        <CustomerProductMappingFormPage />
      </MemoryRouter>,
    )

    for (const label of ['Customer & Product', 'Commercial', 'Requirements', 'Preview']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })
})

describe('CustomerProductMappingFormPage — Customer & Product', () => {
  it('creates the mapping and moves to the Commercial step on Continue', async () => {
    const created: CustomerProductMapping = {
      id: 1,
      customer: 1,
      customer_name: 'Acme Exports',
      item: 1,
      item_name: '10 Inch Plate',
      item_code: 'SQ10',
      customer_sku: 'CPM-SKU-1',
      mapping_code: 'CPM-1',
      is_active: true,
      current_version: {
        id: 10,
        mapping: 1,
        mapping_code: 'CPM-1',
        customer_name: 'Acme Exports',
        item_name: '10 Inch Plate',
        item_code: 'SQ10',
        version_number: 1,
        status: 'DRAFT',
        effective_from: null,
        effective_to: null,
        customer_sku: 'CPM-SKU-1',
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
    }
    mockedApi.createCustomerProductMapping.mockResolvedValue(created)
    mockedApi.getCustomerProductMappingVersion.mockResolvedValue(created.current_version!)

    render(
      <MemoryRouter>
        <CustomerProductMappingFormPage />
      </MemoryRouter>,
    )
    await screen.findByLabelText('Customer SKU')

    fireEvent.mouseDown(screen.getByLabelText('Customer'))
    fireEvent.click(await screen.findByTitle('Acme Exports (CUST-1)'))
    fireEvent.mouseDown(screen.getByLabelText('Item'))
    fireEvent.click(await screen.findByTitle('10 Inch Plate (SQ10)'))
    fireEvent.change(screen.getByLabelText('Customer SKU'), { target: { value: 'CPM-SKU-1' } })

    fireEvent.click(screen.getByRole('button', { name: 'Save & Continue →' }))

    await waitFor(() =>
      expect(mockedApi.createCustomerProductMapping).toHaveBeenCalledWith({
        customer: 1,
        item: 1,
        customer_sku: 'CPM-SKU-1',
        is_active: true,
      }),
    )
    expect(await screen.findByLabelText('Customer Description')).toBeInTheDocument()
    expect(screen.queryByLabelText('Customer SKU')).not.toBeInTheDocument()
  })
})
