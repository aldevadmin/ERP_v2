import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import CustomerSkuMappingsPage from './CustomerSkuMappingsPage'
import * as productsApi from './api'
import type { CustomerSKUMapping, CustomerSKUMappingListResponse } from './types'

vi.mock('./api')

const mockedApi = vi.mocked(productsApi)

afterEach(() => {
  vi.clearAllMocks()
})

const unconfiguredMapping: CustomerSKUMapping = {
  id: 1,
  customer: 1,
  customer_name: 'Acme Exports',
  customer_sku_code: 'PLATE-10SQ',
  customer_description: '10 Inch Plate',
  product: 1,
  product_sku_code: 'SKU-1',
  product_name: 'Areca Plate',
  pieces_per_pouch: null,
  pouches_per_carton: null,
  pieces_per_carton: null,
  pouch_height_inches: null,
  carton_ply_rating: '',
  carton_length_mm: null,
  carton_breadth_mm: null,
  carton_height_mm: null,
  carton_net_weight_kg: null,
  carton_gross_weight_kg: null,
  pouch_thickness_microns: null,
  pouch_length_mm: null,
  pouch_breadth_mm: null,
  pouch_height_mm: null,
  has_retail_sticker: null,
  retail_sticker_comments: '',
  has_silica_gel: null,
  other_packing_requirements: '',
  files: [],
}

const configuredMapping: CustomerSKUMapping = {
  ...unconfiguredMapping,
  id: 2,
  customer_sku_code: 'BOWL-8RD',
  pieces_per_pouch: 25,
  pouches_per_carton: 20,
  pieces_per_carton: 500,
  carton_ply_rating: '5_PLY',
}

const mappingResponse: CustomerSKUMappingListResponse = {
  count: 1,
  next: null,
  previous: null,
  results: [unconfiguredMapping],
}

describe('CustomerSkuMappingsPage', () => {
  it('renders mappings from the API', async () => {
    mockedApi.listCustomerSkuMappings.mockResolvedValue(mappingResponse)

    render(
      <MemoryRouter>
        <CustomerSkuMappingsPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Acme Exports')).toBeInTheDocument()
    expect(screen.getByText('PLATE-10SQ')).toBeInTheDocument()
    expect(screen.getByText('SKU-1')).toBeInTheDocument()
  })

  it('shows Configured or Not set based on whether packing fields are filled in', async () => {
    mockedApi.listCustomerSkuMappings.mockResolvedValue({
      count: 2,
      next: null,
      previous: null,
      results: [unconfiguredMapping, configuredMapping],
    })

    render(
      <MemoryRouter>
        <CustomerSkuMappingsPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Not set')).toBeInTheDocument()
    expect(screen.getByText('Configured')).toBeInTheDocument()
  })

  it('deletes a mapping after confirmation', async () => {
    mockedApi.listCustomerSkuMappings.mockResolvedValue(mappingResponse)
    mockedApi.deleteCustomerSkuMapping.mockResolvedValue(undefined)

    render(
      <MemoryRouter>
        <CustomerSkuMappingsPage />
      </MemoryRouter>,
    )
    await screen.findByText('PLATE-10SQ')

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(await screen.findByRole('button', { name: 'OK' }))

    await waitFor(() => expect(mockedApi.deleteCustomerSkuMapping).toHaveBeenCalledWith(1))
  })
})
