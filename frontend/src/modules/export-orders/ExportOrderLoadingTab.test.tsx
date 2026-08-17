import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import ExportOrderLoadingTab from './ExportOrderLoadingTab'
import * as exportOrdersApi from './api'
import type { LoadingTransaction, LoadingTransactionLogEntry, Shipment, ShipmentLine } from './types'

vi.mock('./api')

const mockedApi = vi.mocked(exportOrdersApi)

afterEach(() => {
  vi.clearAllMocks()
})

const shipment: Shipment = {
  id: 1,
  shipment_number: 'EO-2026-0001-S01',
  status: 'LOADING',
  planned_container_type: '40ft HC',
  planned_ready_date: '2026-08-20',
  planned_stuffing_date: '2026-08-15',
  container_number: 'MSCU1234567',
  remarks: '',
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
}

const shipmentLine: ShipmentLine = {
  id: 10,
  export_order_line: 1,
  customer_sku_code: 'CUST-SKU-1',
  product_sku_code: 'SKU-1',
  product_name: 'Areca Plate',
  required_cartons: 20,
  planned_qty: 1600,
  planned_cartons: 16,
  packed_cartons: 16,
  actual_loaded_cartons: 14,
  loaded_pouches: 0,
  actual_loaded_qty: 1400,
  difference_cartons: -2,
  loading_status: 'SHORT_LOADED',
  last_loading_transaction_at: '2026-08-12T09:30:00Z',
  net_weight_kg: 140,
  gross_weight_kg: 150,
  remaining_balance_cartons: 2,
  remarks: '',
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-12T09:30:00Z',
}

function setupMocks() {
  mockedApi.listShipments.mockResolvedValue([shipment])
  mockedApi.listShipmentLines.mockResolvedValue([shipmentLine])
  mockedApi.listSkuSupplyPlans.mockResolvedValue([])
  mockedApi.listLoadingTransactionsLog.mockResolvedValue({
    count: 0,
    next: null,
    previous: null,
    results: [],
  })
}

describe('ExportOrderLoadingTab', () => {
  it('shows a readiness row with pieces-based figures and status', async () => {
    setupMocks()

    render(<ExportOrderLoadingTab exportOrderId={1} />)

    expect(await screen.findByText('CUST-SKU-1')).toBeInTheDocument()
    expect(screen.getByText('20 boxes')).toBeInTheDocument()
    expect(screen.getByText('1,600 pcs')).toBeInTheDocument()
    expect(screen.getByText('1,400 pcs')).toBeInTheDocument()
    expect(screen.getByText('200 pcs')).toBeInTheDocument()
    expect(screen.getByText('On Track')).toBeInTheDocument()
  })

  it('adds a loading transaction with cartons loaded', async () => {
    setupMocks()
    const created: LoadingTransaction = {
      id: 1,
      date: '2026-08-16',
      entry_type: 'CARTON_LOADED',
      cartons_loaded: 2,
      pouches_loaded: null,
      calculated_pieces: 200,
      variance_reason: '',
      remarks: '',
      entered_by: 'Coordinator',
      created_at: '2026-08-16T00:00:00Z',
    }
    mockedApi.createLoadingTransaction.mockResolvedValue(created)

    render(<ExportOrderLoadingTab exportOrderId={1} />)
    await screen.findByText('CUST-SKU-1')

    fireEvent.click(screen.getByRole('button', { name: 'Update Loading' }))
    const dialog = await screen.findByRole('dialog')

    fireEvent.change(within(dialog).getByLabelText('Cartons Loaded Now'), {
      target: { value: '2' },
    })

    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(mockedApi.createLoadingTransaction).toHaveBeenCalledWith(1, 1, 10, {
        date: expect.any(String),
        entry_type: 'CARTON_LOADED',
        cartons_loaded: 2,
        pouches_loaded: null,
        variance_reason: undefined,
        remarks: '',
      }),
    )
  })

  it('rejects entering both cartons and pouches in the same transaction', async () => {
    setupMocks()

    render(<ExportOrderLoadingTab exportOrderId={1} />)
    await screen.findByText('CUST-SKU-1')

    fireEvent.click(screen.getByRole('button', { name: 'Update Loading' }))
    const dialog = await screen.findByRole('dialog')

    fireEvent.change(within(dialog).getByLabelText('Cartons Loaded Now'), {
      target: { value: '2' },
    })
    fireEvent.change(within(dialog).getByLabelText('Pouches Loaded Now'), {
      target: { value: '2' },
    })

    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    expect(
      await within(dialog).findAllByText('Enter cartons OR pouches, not both.'),
    ).not.toHaveLength(0)
    expect(mockedApi.createLoadingTransaction).not.toHaveBeenCalled()
  })

  it('renders the collapsed Loading Transactions feed and filters by SKU', async () => {
    setupMocks()
    const logEntry: LoadingTransactionLogEntry = {
      id: 1,
      date: '2026-08-12',
      export_order_line: 1,
      customer_sku_code: 'CUST-SKU-1',
      product_name: 'Areca Plate',
      entry_type: 'CARTON_LOADED',
      cartons_loaded: 14,
      pouches_loaded: null,
      calculated_pieces: 1400,
      variance_reason: 'PACKING_SHORTAGE',
      remarks: '',
      entered_by: 'coord1',
      created_at: '2026-08-12T09:30:00Z',
    }
    mockedApi.listLoadingTransactionsLog.mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [logEntry],
    })

    render(<ExportOrderLoadingTab exportOrderId={1} />)
    await screen.findByText('CUST-SKU-1')

    fireEvent.click(screen.getByText('Loading Transactions'))

    expect(await screen.findByText('PACKING_SHORTAGE')).toBeInTheDocument()

    fireEvent.mouseDown(screen.getByLabelText('Filter transactions by SKU'))
    fireEvent.click(await screen.findByText('CUST-SKU-1 — Areca Plate'))

    await waitFor(() =>
      expect(mockedApi.listLoadingTransactionsLog).toHaveBeenLastCalledWith(1, 1, {
        line: 1,
        page: 1,
        pageSize: 10,
      }),
    )
  })

  it('shows the create-a-shipment prompt when there are no shipments', async () => {
    mockedApi.listShipments.mockResolvedValue([])

    render(<ExportOrderLoadingTab exportOrderId={1} />)

    expect(
      await screen.findByText('Create a shipment first, in the Shipping tab.'),
    ).toBeInTheDocument()
  })
})
