import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import CustomerProductMappingListPage from './CustomerProductMappingListPage'
import { ApiError } from '../../shared/api/http'
import * as api from './api'
import type { CustomerProductMappingListResponse } from './types'

vi.mock('./api')

const mockedApi = vi.mocked(api)

afterEach(() => {
  vi.clearAllMocks()
})

const response: CustomerProductMappingListResponse = {
  count: 1,
  next: null,
  previous: null,
  results: [
    {
      id: 1,
      customer: 1,
      customer_name: 'Acme Exports',
      item: 1,
      item_name: '10 Inch Plate',
      item_code: 'SQ10',
      customer_sku: 'CUST-SKU-1',
      mapping_code: 'CPM-1',
      is_active: true,
      current_version: {
        id: 1,
        mapping: 1,
        mapping_code: 'CPM-1',
        customer_name: 'Acme Exports',
        item_name: '10 Inch Plate',
        item_code: 'SQ10',
        version_number: 1,
        status: 'DRAFT',
        effective_from: null,
        effective_to: null,
        customer_sku: 'CUST-SKU-1',
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
}

describe('CustomerProductMappingListPage', () => {
  it('renders mappings from the API', async () => {
    mockedApi.listCustomerProductMappings.mockResolvedValue(response)

    render(
      <MemoryRouter>
        <CustomerProductMappingListPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Acme Exports')).toBeInTheDocument()
    expect(screen.getByText('CUST-SKU-1')).toBeInTheDocument()
    expect(screen.getByText('v1 — DRAFT')).toBeInTheDocument()
  })

  it('deletes a mapping after confirmation', async () => {
    mockedApi.listCustomerProductMappings.mockResolvedValue(response)
    mockedApi.deleteCustomerProductMapping.mockResolvedValue(undefined)

    render(
      <MemoryRouter>
        <CustomerProductMappingListPage />
      </MemoryRouter>,
    )
    await screen.findByText('Acme Exports')

    fireEvent.click(screen.getByLabelText('Delete CPM-1'))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(mockedApi.deleteCustomerProductMapping).toHaveBeenCalledWith(1))
  })

  it('shows the backend error when delete fails', async () => {
    mockedApi.listCustomerProductMappings.mockResolvedValue(response)
    mockedApi.deleteCustomerProductMapping.mockRejectedValue(
      new ApiError('Cannot delete — referenced elsewhere.', 400),
    )

    render(
      <MemoryRouter>
        <CustomerProductMappingListPage />
      </MemoryRouter>,
    )
    await screen.findByText('Acme Exports')

    fireEvent.click(screen.getByLabelText('Delete CPM-1'))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))

    expect(await screen.findByText('Cannot delete — referenced elsewhere.')).toBeInTheDocument()
  })
})
