import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import ExportOrderDetailPage from './ExportOrderDetailPage'
import * as exportOrdersApi from './api'
import * as customerMappingsApi from '../customer-mappings/api'
import * as itemsApi from '../items/api'
import * as accountsApi from '../accounts/api'
import * as vendorsApi from '../vendors/api'
import type { ExportOrder } from './types'

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return { ...actual, useParams: () => ({ id: '1' }), useNavigate: () => vi.fn() }
})
vi.mock('./api')
vi.mock('../customer-mappings/api')
vi.mock('../items/api')
vi.mock('../accounts/api')
vi.mock('../vendors/api')

const mockedApi = vi.mocked(exportOrdersApi)
const mockedCustomerMappingsApi = vi.mocked(customerMappingsApi)
const mockedItemsApi = vi.mocked(itemsApi)
const mockedAccountsApi = vi.mocked(accountsApi)
const mockedVendorsApi = vi.mocked(vendorsApi)

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
  export_coordinator: 1,
  export_coordinator_detail: { id: 1, employee_code: 'EMP1', full_name: 'Jane Doe', team: null },
  country: 'USA',
  destination_port: 'Chennai',
  requested_shipment_date: '2026-02-01',
  planned_container_ready_date: '2026-02-10',
  container_type: null,
  currency: 'USD',
  incoterm: 'FOB',
  payment_terms: 'Net 30',
  bill_to: null,
  bill_to_detail: null,
  ship_to: null,
  ship_to_detail: null,
  status: 'PLANNING',
  stage_history: [],
  internal_remarks: 'Handle with care',
  customer_remarks: 'Rush order',
  po_versions: [
    {
      id: 1,
      version_number: 1,
      document: 'http://localhost:8000/media/po.pdf',
      remarks: 'Initial PO',
      is_current: true,
      created_at: '2026-01-15T00:00:00Z',
      uploaded_by: 'coord1',
    },
  ],
  created_at: '2026-01-15T00:00:00Z',
  updated_at: '2026-01-15T00:00:00Z',
}

describe('ExportOrderDetailPage', () => {
  it('renders order details grouped into sections', async () => {
    mockedApi.getExportOrder.mockResolvedValue(order)
    mockedApi.listExportOrderNotes.mockResolvedValue([])

    render(
      <MemoryRouter>
        <ExportOrderDetailPage />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'EO-2026-0001' })).toBeInTheDocument()
    expect(screen.getAllByText('Acme Exports').length).toBeGreaterThan(0)
    expect(screen.getByText('Jane Doe')).toBeInTheDocument()
    expect(screen.getByText('Chennai')).toBeInTheDocument()
    expect(screen.getByText('Net 30')).toBeInTheDocument()
    expect(screen.getByText('Handle with care')).toBeInTheDocument()
    expect(screen.getByText('Initial PO')).toBeInTheDocument()
    expect(screen.getAllByText('Current').length).toBeGreaterThan(0)
  })

  it('cancels the order', async () => {
    mockedApi.getExportOrder.mockResolvedValue(order)
    mockedApi.listExportOrderNotes.mockResolvedValue([])
    mockedApi.cancelExportOrder.mockResolvedValue({ ...order, status: 'CANCELLED' })

    render(
      <MemoryRouter>
        <ExportOrderDetailPage />
      </MemoryRouter>,
    )
    await screen.findByRole('heading', { name: 'EO-2026-0001' })

    fireEvent.click(screen.getByLabelText('Order actions'))
    fireEvent.click(await screen.findByText('Cancel Order'))
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel Order' }))

    await waitFor(() => expect(mockedApi.cancelExportOrder).toHaveBeenCalledWith(1))
    expect(await screen.findAllByText('Cancelled')).not.toHaveLength(0)
  })

  it('advances the order to the next stage', async () => {
    mockedApi.getExportOrder.mockResolvedValue(order)
    mockedApi.listExportOrderNotes.mockResolvedValue([])
    mockedApi.advanceExportOrder.mockResolvedValue({ ...order, status: 'FULFILMENT' })

    render(
      <MemoryRouter>
        <ExportOrderDetailPage />
      </MemoryRouter>,
    )
    await screen.findByRole('heading', { name: 'EO-2026-0001' })

    fireEvent.click(screen.getByLabelText('Order actions'))
    fireEvent.click(await screen.findByText('Advance to Next Stage'))

    await waitFor(() => expect(mockedApi.advanceExportOrder).toHaveBeenCalledWith(1))
    expect(await screen.findAllByText('Fulfilment')).not.toHaveLength(0)
  })

  it('shows a breadcrumb back to the Export Orders list', async () => {
    mockedApi.getExportOrder.mockResolvedValue(order)
    mockedApi.listExportOrderNotes.mockResolvedValue([])

    render(
      <MemoryRouter>
        <ExportOrderDetailPage />
      </MemoryRouter>,
    )
    await screen.findByRole('heading', { name: 'EO-2026-0001' })

    expect(screen.getByRole('link', { name: 'Export Orders' })).toHaveAttribute(
      'href',
      '/export-orders',
    )
  })

  it('shows a not-found state when the order fails to load', async () => {
    mockedApi.getExportOrder.mockRejectedValue(new Error('not found'))

    render(
      <MemoryRouter>
        <ExportOrderDetailPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Export order not found')).toBeInTheDocument()
  })

  it('renders the lines table when switching to the Order Lines tab', async () => {
    mockedApi.getExportOrder.mockResolvedValue(order)
    mockedApi.listExportOrderNotes.mockResolvedValue([])
    mockedApi.listExportOrderLines.mockResolvedValue([])
    mockedApi.listPackingMaterialRequirements.mockResolvedValue([])
    mockedCustomerMappingsApi.listCustomerProductMappings.mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      results: [],
    })
    mockedItemsApi.listItems.mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      results: [],
    })

    render(
      <MemoryRouter>
        <ExportOrderDetailPage />
      </MemoryRouter>,
    )
    await screen.findByRole('heading', { name: 'EO-2026-0001' })

    fireEvent.click(screen.getByRole('tab', { name: 'Order Lines' }))

    await waitFor(() => expect(mockedApi.listExportOrderLines).toHaveBeenCalledWith(1))
    expect(await screen.findByText('Add Line')).toBeInTheDocument()
  })

  it('renders the SKU readiness table when switching to the Fulfilment tab', async () => {
    mockedApi.getExportOrder.mockResolvedValue(order)
    mockedApi.listExportOrderNotes.mockResolvedValue([])
    mockedApi.listProductionRequirements.mockResolvedValue([])
    mockedApi.listProcurementRequirements.mockResolvedValue([])
    mockedApi.listSkuSupplyPlans.mockResolvedValue([])
    mockedApi.listFulfilmentTransactions.mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      results: [],
    })
    mockedVendorsApi.listVendors.mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      results: [],
    })

    render(
      <MemoryRouter>
        <ExportOrderDetailPage />
      </MemoryRouter>,
    )
    await screen.findByRole('heading', { name: 'EO-2026-0001' })

    fireEvent.click(screen.getByRole('tab', { name: 'Fulfilment' }))

    await waitFor(() => expect(mockedApi.listProductionRequirements).toHaveBeenCalledWith(1))
    await waitFor(() => expect(mockedApi.listProcurementRequirements).toHaveBeenCalledWith(1))
    await waitFor(() => expect(mockedApi.listFulfilmentTransactions).toHaveBeenCalled())
    expect(await screen.findByRole('button', { name: /Add Manual Transaction/ })).toBeInTheDocument()
  })

  it('renders the packing readiness table when switching to the Packing tab', async () => {
    mockedApi.getExportOrder.mockResolvedValue(order)
    mockedApi.listExportOrderNotes.mockResolvedValue([])
    mockedApi.listPackingMonitor.mockResolvedValue([])
    mockedApi.listSkuSupplyPlans.mockResolvedValue([])
    mockedApi.listPackingTransactionsLog.mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      results: [],
    })
    mockedAccountsApi.listEmployees.mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      results: [],
    })
    mockedAccountsApi.listTeams.mockResolvedValue({ count: 0, next: null, previous: null, results: [] })

    render(
      <MemoryRouter>
        <ExportOrderDetailPage />
      </MemoryRouter>,
    )
    await screen.findByRole('heading', { name: 'EO-2026-0001' })

    fireEvent.click(screen.getByRole('tab', { name: 'Packing' }))

    await waitFor(() => expect(mockedApi.listPackingMonitor).toHaveBeenCalledWith(1))
    expect(
      await screen.findByRole('button', { name: /Add Manual Transaction/ }),
    ).toBeInTheDocument()
  })

  it('renders the shipment list when switching to the Shipping tab', async () => {
    mockedApi.getExportOrder.mockResolvedValue(order)
    mockedApi.listExportOrderNotes.mockResolvedValue([])
    mockedApi.listShipments.mockResolvedValue([])
    mockedApi.listExportOrderLines.mockResolvedValue([])

    render(
      <MemoryRouter>
        <ExportOrderDetailPage />
      </MemoryRouter>,
    )
    await screen.findByRole('heading', { name: 'EO-2026-0001' })

    fireEvent.click(screen.getByRole('tab', { name: 'Shipping' }))

    await waitFor(() => expect(mockedApi.listShipments).toHaveBeenCalledWith(1))
    expect(await screen.findByRole('button', { name: 'New Shipment' })).toBeInTheDocument()
  })

  it('renders the create-a-shipment prompt when switching to the Loading tab with no shipments', async () => {
    mockedApi.getExportOrder.mockResolvedValue(order)
    mockedApi.listExportOrderNotes.mockResolvedValue([])
    mockedApi.listShipments.mockResolvedValue([])

    render(
      <MemoryRouter>
        <ExportOrderDetailPage />
      </MemoryRouter>,
    )
    await screen.findByRole('heading', { name: 'EO-2026-0001' })

    fireEvent.click(screen.getByRole('tab', { name: 'Loading' }))

    await waitFor(() => expect(mockedApi.listShipments).toHaveBeenCalledWith(1))
    expect(await screen.findByText(/Create a shipment first/)).toBeInTheDocument()
  })

  it('shows Mark as Loaded / Export Loading Sheet instead of Edit Order on the Loading tab', async () => {
    mockedApi.getExportOrder.mockResolvedValue(order)
    mockedApi.listExportOrderNotes.mockResolvedValue([])
    mockedApi.listShipments.mockResolvedValue([])

    render(
      <MemoryRouter>
        <ExportOrderDetailPage />
      </MemoryRouter>,
    )
    await screen.findByRole('heading', { name: 'EO-2026-0001' })
    expect(screen.getByRole('button', { name: /Edit Order/ })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Loading' }))

    expect(await screen.findByRole('button', { name: /Mark as Loaded/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Export Loading Sheet/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Edit Order/ })).not.toBeInTheDocument()
  })
})
