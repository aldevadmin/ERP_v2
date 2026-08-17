import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useNavigate, useParams } from 'react-router'
import CustomerSkuMappingFormPage from './CustomerSkuMappingFormPage'
import * as productsApi from './api'
import * as customersApi from '../customers/api'
import type { CustomerListResponse } from '../customers/types'
import type { CustomerSKUMapping, ProductListResponse } from './types'

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return { ...actual, useNavigate: vi.fn(), useParams: vi.fn() }
})
vi.mock('./api')
vi.mock('../customers/api')

const mockedApi = vi.mocked(productsApi)
const mockedCustomersApi = vi.mocked(customersApi)
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

const customersResponse: CustomerListResponse = {
  count: 1,
  next: null,
  previous: null,
  results: [
    { id: 1, code: 'CUST-1', name: 'Acme Exports', main_poc: '', internal_coordinator: null, internal_coordinator_detail: null, is_active: true },
  ],
}

const productsResponse: ProductListResponse = {
  count: 1,
  next: null,
  previous: null,
  results: [
    { id: 1, sku_code: 'SKU-1', name: 'Areca Plate', description: '', base_unit: 'Piece', is_active: true },
  ],
}

const baseMapping: CustomerSKUMapping = {
  id: 5,
  customer: 1,
  customer_name: 'Acme Exports',
  customer_sku_code: 'PLATE-10SQ',
  customer_description: '10 Inch Plate',
  product: 1,
  product_sku_code: 'SKU-1',
  product_name: 'Areca Plate',
  pieces_per_pouch: 25,
  pouches_per_carton: 20,
  pieces_per_carton: 500,
  pouch_height_inches: 3.5,
  carton_ply_rating: '5_PLY',
  carton_length_mm: 600,
  carton_breadth_mm: 400,
  carton_height_mm: 400,
  carton_net_weight_kg: 18.5,
  carton_gross_weight_kg: 20,
  pouch_thickness_microns: 60,
  pouch_length_mm: 150,
  pouch_breadth_mm: 100,
  pouch_height_mm: 5,
  has_retail_sticker: true,
  retail_sticker_comments: 'Customer logo, gold foil',
  has_silica_gel: false,
  other_packing_requirements: 'Shrink wrap pallet',
  files: [],
}

describe('CustomerSkuMappingFormPage — create', () => {
  beforeEach(() => {
    mockedCustomersApi.listCustomers.mockResolvedValue(customersResponse)
    mockedApi.listProducts.mockResolvedValue(productsResponse)
  })

  it('creates a mapping and navigates to the edit URL', async () => {
    const created = { ...baseMapping }
    mockedApi.createCustomerSkuMapping.mockResolvedValue(created)

    render(
      <MemoryRouter>
        <CustomerSkuMappingFormPage />
      </MemoryRouter>,
    )
    await waitFor(() => expect(mockedCustomersApi.listCustomers).toHaveBeenCalled())

    const comboboxes = await screen.findAllByRole('combobox')
    fireEvent.mouseDown(comboboxes[0])
    fireEvent.click(await screen.findByText('Acme Exports (CUST-1)'))

    fireEvent.change(screen.getByLabelText('Customer SKU Code'), {
      target: { value: 'PLATE-10SQ' },
    })

    fireEvent.mouseDown(comboboxes[1])
    fireEvent.click(await screen.findByText('Areca Plate (SKU-1)'))

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(mockedApi.createCustomerSkuMapping).toHaveBeenCalledWith(
        expect.objectContaining({ customer: 1, customer_sku_code: 'PLATE-10SQ', product: 1 }),
      ),
    )
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith('/products/mappings/5/edit', { replace: true }),
    )
  })

  it('hides the file upload sections before the mapping is first saved', async () => {
    render(
      <MemoryRouter>
        <CustomerSkuMappingFormPage />
      </MemoryRouter>,
    )
    await waitFor(() => expect(mockedCustomersApi.listCustomers).toHaveBeenCalled())

    expect(
      screen.getByText('Save the mapping first to attach images or files.'),
    ).toBeInTheDocument()
  })

  it('reveals the file upload sections in place once the mapping is created', async () => {
    const created = { ...baseMapping }
    mockedApi.createCustomerSkuMapping.mockResolvedValue(created)

    render(
      <MemoryRouter>
        <CustomerSkuMappingFormPage />
      </MemoryRouter>,
    )
    await waitFor(() => expect(mockedCustomersApi.listCustomers).toHaveBeenCalled())

    const comboboxes = await screen.findAllByRole('combobox')
    fireEvent.mouseDown(comboboxes[0])
    fireEvent.click(await screen.findByText('Acme Exports (CUST-1)'))
    fireEvent.change(screen.getByLabelText('Customer SKU Code'), {
      target: { value: 'PLATE-10SQ' },
    })
    fireEvent.mouseDown(comboboxes[1])
    fireEvent.click(await screen.findByText('Areca Plate (SKU-1)'))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Plate Image')).toBeInTheDocument()
    expect(
      screen.queryByText('Save the mapping first to attach images or files.'),
    ).not.toBeInTheDocument()
  })
})

describe('CustomerSkuMappingFormPage — edit', () => {
  beforeEach(() => {
    mockedUseParams.mockReturnValue({ id: '5' })
    mockedCustomersApi.listCustomers.mockResolvedValue(customersResponse)
    mockedApi.listProducts.mockResolvedValue(productsResponse)
  })

  it('loads and prefills the structured packing fields', async () => {
    mockedApi.getCustomerSkuMapping.mockResolvedValue(baseMapping)

    render(
      <MemoryRouter>
        <CustomerSkuMappingFormPage />
      </MemoryRouter>,
    )

    expect(await screen.findByDisplayValue('PLATE-10SQ')).toBeInTheDocument()
    expect(screen.getByDisplayValue('3.5')).toBeInTheDocument() // pouch height inches
    expect(screen.getByDisplayValue('600')).toBeInTheDocument() // carton length mm
    expect(screen.getByDisplayValue('Customer logo, gold foil')).toBeInTheDocument()
  })

  it('reveals retail sticker comments and upload once "Yes" is selected', async () => {
    mockedApi.getCustomerSkuMapping.mockResolvedValue({
      ...baseMapping,
      has_retail_sticker: null,
    })

    render(
      <MemoryRouter>
        <CustomerSkuMappingFormPage />
      </MemoryRouter>,
    )
    await screen.findByDisplayValue('PLATE-10SQ')

    expect(screen.queryByText('Retail Sticker Images')).not.toBeInTheDocument()

    // Retail Stickers' "Yes" radio comes before Silica Gel's in DOM order.
    fireEvent.click(screen.getAllByRole('radio', { name: 'Yes' })[0])

    expect(await screen.findByText('Retail Sticker Images')).toBeInTheDocument()
  })

  it('uploads a plate image with the correct category', async () => {
    mockedApi.getCustomerSkuMapping.mockResolvedValue(baseMapping)
    mockedApi.uploadCustomerSkuMappingFile.mockResolvedValue({
      id: 100,
      category: 'PLATE_IMAGE',
      file: 'http://localhost:8000/media/plate.jpg',
      created_at: '2026-01-01T00:00:00Z',
    })

    render(
      <MemoryRouter>
        <CustomerSkuMappingFormPage />
      </MemoryRouter>,
    )
    await screen.findByDisplayValue('PLATE-10SQ')

    const file = new File(['data'], 'plate.jpg', { type: 'image/jpeg' })
    const plateSection = screen.getByText('Plate Image').closest('.ant-form-item') as HTMLElement
    const input = plateSection.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() =>
      expect(mockedApi.uploadCustomerSkuMappingFile).toHaveBeenCalledWith(5, 'PLATE_IMAGE', file),
    )
  })
})
