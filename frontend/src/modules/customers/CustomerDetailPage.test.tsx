import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import CustomerDetailPage from './CustomerDetailPage'
import * as customersApi from './api'
import * as customerMappingsApi from '../customer-mappings/api'
import type { Customer } from './types'

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return { ...actual, useParams: () => ({ id: '3' }), useNavigate: () => vi.fn() }
})
vi.mock('./api')
vi.mock('../customer-mappings/api')

const mockedApi = vi.mocked(customersApi)
const mockedCustomerMappingsApi = vi.mocked(customerMappingsApi)

afterEach(() => {
  vi.clearAllMocks()
})

beforeEach(() => {
  mockedCustomerMappingsApi.listCustomerProductMappings.mockResolvedValue({
    count: 0,
    next: null,
    previous: null,
    results: [],
  })
})

describe('CustomerDetailPage', () => {
  it('renders customer details and addresses', async () => {
    const customer: Customer = {
      id: 3,
      code: 'C3',
      name: 'Acme',
      main_poc: 'Jane Doe',
      emails: ['ops@acme.com'],
      phone_numbers: ['+1-555-1000'],
      internal_coordinator: 1,
      internal_coordinator_detail: { id: 1, employee_code: 'EMP1', full_name: 'Asha Rao', team: null },
      is_active: true,
      addresses: [
        {
          id: 1,
          address_type: 'BILLING',
          line1: '1 Main St',
          line2: '',
          line3: '',
          state: '',
          pin: '12345',
          country: 'USA',
        },
      ],
    }
    mockedApi.getCustomer.mockResolvedValue(customer)

    render(
      <MemoryRouter>
        <CustomerDetailPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Acme')).toBeInTheDocument()
    expect(screen.getByText('C3')).toBeInTheDocument()
    expect(screen.getByText('Billing')).toBeInTheDocument()
    expect(screen.getByText('1 Main St')).toBeInTheDocument()
    expect(screen.getByText('Asha Rao')).toBeInTheDocument()
  })

  it('renders mapped products as a reverse projection', async () => {
    const customer: Customer = {
      id: 3,
      code: 'C3',
      name: 'Acme',
      main_poc: 'Jane Doe',
      emails: [],
      phone_numbers: [],
      internal_coordinator: null,
      internal_coordinator_detail: null,
      is_active: true,
      addresses: [],
    }
    mockedApi.getCustomer.mockResolvedValue(customer)
    mockedCustomerMappingsApi.listCustomerProductMappings.mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          id: 5,
          customer: 3,
          customer_name: 'Acme',
          item: 1,
          item_name: '10 Inch Plate',
          item_code: 'SQ10',
          customer_sku: 'SKU-A',
          mapping_code: 'CPM-1',
          is_active: true,
          current_version: {
            id: 1,
            mapping: 5,
            mapping_code: 'CPM-1',
            customer_name: 'Acme',
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
        <CustomerDetailPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('10 Inch Plate')).toBeInTheDocument()
    expect(screen.getByText('SKU-A')).toBeInTheDocument()
    expect(screen.getByText('v1 — PUBLISHED')).toBeInTheDocument()
  })

  it('shows a not-found state when the customer fails to load', async () => {
    mockedApi.getCustomer.mockRejectedValue(new Error('not found'))

    render(
      <MemoryRouter>
        <CustomerDetailPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Customer not found')).toBeInTheDocument()
  })
})
