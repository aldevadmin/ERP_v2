import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import ExportOrderListPage from './ExportOrderListPage'
import * as exportOrdersApi from './api'
import * as customersApi from '../customers/api'
import type { CustomerListResponse } from '../customers/types'
import type { ExportOrderListResponse } from './types'

vi.mock('./api')
vi.mock('../customers/api')

const mockedApi = vi.mocked(exportOrdersApi)
const mockedCustomersApi = vi.mocked(customersApi)

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

const listResponse: ExportOrderListResponse = {
  count: 1,
  next: null,
  previous: null,
  results: [
    {
      id: 1,
      order_number: 'EO-2026-0001',
      customer: 1,
      customer_name: 'Acme Exports',
      customer_po_number: 'PO-100',
      customer_po_date: '2026-01-05',
      destination_port: 'Chennai',
      planned_container_ready_date: '2026-02-01',
      container_type: '40ft HC',
      status: 'PLANNING',
      export_coordinator_name: 'Jane Doe',
    },
  ],
}

function setupMocks() {
  mockedApi.listExportOrders.mockResolvedValue(listResponse)
  mockedCustomersApi.listCustomers.mockResolvedValue(customersResponse)
}

describe('ExportOrderListPage', () => {
  it('renders export orders from the API', async () => {
    setupMocks()

    render(
      <MemoryRouter>
        <ExportOrderListPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('EO-2026-0001')).toBeInTheDocument()
    expect(screen.getByText('Acme Exports')).toBeInTheDocument()
    expect(screen.getByText('PO-100')).toBeInTheDocument()
    expect(screen.getByText('2026-01-05')).toBeInTheDocument()
    expect(screen.getByText('2026-02-01')).toBeInTheDocument()
    expect(screen.getByText('40ft HC')).toBeInTheDocument()
    expect(screen.getByLabelText('Planning (current)')).toBeInTheDocument()
    expect(mockedApi.listExportOrders).toHaveBeenCalledWith({
      search: undefined,
      status: undefined,
      customer: undefined,
      crdFrom: undefined,
      crdTo: undefined,
      page: 1,
    })
  })

  it('applies a status filter only once "Filter" is clicked', async () => {
    setupMocks()

    render(
      <MemoryRouter>
        <ExportOrderListPage />
      </MemoryRouter>,
    )
    await screen.findByText('EO-2026-0001')

    const statusCombobox = screen.getAllByRole('combobox')[1]
    fireEvent.mouseDown(statusCombobox)
    fireEvent.click(await screen.findByText('Cancelled'))

    // Not applied yet — still just the initial call.
    expect(mockedApi.listExportOrders).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Filter' }))

    await waitFor(() =>
      expect(mockedApi.listExportOrders).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'CANCELLED', page: 1 }),
      ),
    )
  })

  it('clears filters on Reset', async () => {
    setupMocks()

    render(
      <MemoryRouter>
        <ExportOrderListPage />
      </MemoryRouter>,
    )
    await screen.findByText('EO-2026-0001')

    fireEvent.change(screen.getByPlaceholderText('Search by order no., customer, PO no.'), {
      target: { value: 'EO-2026' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Reset/ }))

    await waitFor(() => expect(mockedApi.listExportOrders).toHaveBeenLastCalledWith({ page: 1 }))
  })

  it('opens the New Order modal', async () => {
    setupMocks()

    render(
      <MemoryRouter>
        <ExportOrderListPage />
      </MemoryRouter>,
    )
    await screen.findByText('EO-2026-0001')

    fireEvent.click(screen.getByRole('button', { name: /New Order/ }))

    expect(await screen.findByLabelText('Customer PO Number')).toBeInTheDocument()
  })

  it('cancels an order from the row actions menu', async () => {
    setupMocks()
    mockedApi.cancelExportOrder.mockResolvedValue({} as never)

    render(
      <MemoryRouter>
        <ExportOrderListPage />
      </MemoryRouter>,
    )
    await screen.findByText('EO-2026-0001')

    fireEvent.click(screen.getByLabelText('Actions — EO-2026-0001'))
    fireEvent.click(await screen.findByText('Cancel Order'))
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel Order' }))

    await waitFor(() => expect(mockedApi.cancelExportOrder).toHaveBeenCalledWith(1))
  })
})
