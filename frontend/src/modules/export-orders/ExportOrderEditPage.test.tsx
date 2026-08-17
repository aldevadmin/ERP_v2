import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import ExportOrderEditPage from './ExportOrderEditPage'
import * as exportOrdersApi from './api'
import * as accountsApi from '../accounts/api'
import * as customersApi from '../customers/api'
import type { EmployeeListResponse } from '../accounts/types'
import type { Customer } from '../customers/types'
import type { ExportOrder } from './types'

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return { ...actual, useParams: () => ({ id: '1' }), useNavigate: () => vi.fn() }
})
vi.mock('./api')
vi.mock('../accounts/api')
vi.mock('../customers/api')

const mockedApi = vi.mocked(exportOrdersApi)
const mockedAccountsApi = vi.mocked(accountsApi)
const mockedCustomersApi = vi.mocked(customersApi)

afterEach(() => {
  vi.clearAllMocks()
})

const order: ExportOrder = {
  id: 1,
  order_number: 'EO-2026-0001',
  customer: 1,
  customer_name: 'Acme Exports',
  customer_po_number: 'PO-100',
  customer_po_date: '2026-01-15',
  export_coordinator: null,
  export_coordinator_detail: null,
  country: 'USA',
  destination_port: 'Chennai',
  requested_shipment_date: null,
  planned_container_ready_date: null,
  container_type: null,
  currency: 'USD',
  incoterm: '',
  payment_terms: '',
  bill_to: null,
  bill_to_detail: null,
  ship_to: null,
  ship_to_detail: null,
  status: 'PLANNING',
  stage_history: [],
  internal_remarks: '',
  customer_remarks: '',
  po_versions: [],
  created_at: '2026-01-15T00:00:00Z',
  updated_at: '2026-01-15T00:00:00Z',
}

const customer: Customer = {
  id: 1,
  code: 'CUST-1',
  name: 'Acme Exports',
  main_poc: '',
  emails: [],
  phone_numbers: [],
  internal_coordinator: null,
  internal_coordinator_detail: null,
  is_active: true,
  addresses: [
    {
      id: 1,
      address_type: 'BILLING_AND_SHIPPING',
      country: 'USA',
      state: '',
      line1: 'Combined Address',
      line2: '',
      line3: '',
      pin: '',
    },
  ],
}

const employeesResponse: EmployeeListResponse = {
  count: 0,
  next: null,
  previous: null,
  results: [],
}

describe('ExportOrderEditPage', () => {
  it('loads the order and submits an update', async () => {
    mockedApi.getExportOrder.mockResolvedValue(order)
    mockedCustomersApi.getCustomer.mockResolvedValue(customer)
    mockedAccountsApi.listEmployees.mockResolvedValue(employeesResponse)
    mockedApi.updateExportOrder.mockResolvedValue(order)

    render(
      <MemoryRouter>
        <ExportOrderEditPage />
      </MemoryRouter>,
    )

    expect(await screen.findByDisplayValue('Chennai')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Destination Port'), {
      target: { value: 'Mumbai' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(mockedApi.updateExportOrder).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ destination_port: 'Mumbai', country: 'USA' }),
      ),
    )
  })

  it('shows a Billing & Shipping address in the Bill To picker', async () => {
    mockedApi.getExportOrder.mockResolvedValue(order)
    mockedCustomersApi.getCustomer.mockResolvedValue(customer)
    mockedAccountsApi.listEmployees.mockResolvedValue(employeesResponse)

    render(
      <MemoryRouter>
        <ExportOrderEditPage />
      </MemoryRouter>,
    )
    await screen.findByDisplayValue('Chennai')

    fireEvent.mouseDown(screen.getByLabelText('Bill To'))

    expect(await screen.findByText('Combined Address, USA')).toBeInTheDocument()
  })

  it('shows a Billing & Shipping address in the Ship To picker', async () => {
    mockedApi.getExportOrder.mockResolvedValue(order)
    mockedCustomersApi.getCustomer.mockResolvedValue(customer)
    mockedAccountsApi.listEmployees.mockResolvedValue(employeesResponse)

    render(
      <MemoryRouter>
        <ExportOrderEditPage />
      </MemoryRouter>,
    )
    await screen.findByDisplayValue('Chennai')

    fireEvent.mouseDown(screen.getByLabelText('Ship To'))

    expect(await screen.findByText('Combined Address, USA')).toBeInTheDocument()
  })
})
