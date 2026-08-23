import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import ExportOrderLoadingTab from './ExportOrderLoadingTab'
import * as exportOrdersApi from './api'
import type {
  ExportOrderLine,
  LoadingTransaction,
  LoadingTransactionLogEntry,
  Shipment,
  ShipmentLine,
} from './types'

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
  item_code: 'SKU-1',
  item_name: 'Areca Plate',
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

const orderLineA: ExportOrderLine = {
  id: 1,
  line_number: 1,
  customer_sku_code: 'CUST-SKU-1',
  customer_description: 'Areca Plate SKU',
  item: 1,
  item_code: 'SKU-1',
  item_name: 'Areca Plate',
  original_customer_quantity: 1600,
  original_customer_unit: 'PIECE',
  pieces_per_pouch: 10,
  pouches_per_carton: 10,
  pieces_per_carton: 100,
  has_retail_sticker: false,
  source_mapping_version: null,
  required_pieces: 1600,
  required_pouches: 160,
  required_cartons: 20,
  required_stickers: 0,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
}

// Not on the shipment yet — the readiness table must still show it
// ("Not Planned" + "Add to Shipment"), not silently omit it.
const orderLineB: ExportOrderLine = {
  id: 2,
  line_number: 2,
  customer_sku_code: 'CUST-SKU-2',
  customer_description: 'Bowl SKU',
  item: 2,
  item_code: 'SKU-2',
  item_name: 'Bowl',
  original_customer_quantity: 500,
  original_customer_unit: 'PIECE',
  pieces_per_pouch: 10,
  pouches_per_carton: 5,
  pieces_per_carton: 50,
  has_retail_sticker: false,
  source_mapping_version: null,
  required_pieces: 500,
  required_pouches: 50,
  required_cartons: 10,
  required_stickers: 0,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
}

function setupMocks() {
  mockedApi.listShipments.mockResolvedValue([shipment])
  mockedApi.listShipmentLines.mockResolvedValue([shipmentLine])
  mockedApi.listExportOrderLines.mockResolvedValue([orderLineA, orderLineB])
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

    // Waits for the planned-line data specifically, not just the SKU code
    // text — "CUST-SKU-1" alone renders in both the planned and briefly-
    // shown not-yet-planned state (allOrderLines resolves in one hop,
    // lines resolves via a two-step effect chain), so it's an ambiguous
    // ready signal.
    expect(await screen.findByText('1,600 pcs')).toBeInTheDocument()
    expect(screen.getByText('CUST-SKU-1')).toBeInTheDocument()
    expect(screen.getByText('20 boxes')).toBeInTheDocument()
    expect(screen.getByText('1,400 pcs')).toBeInTheDocument()
    expect(screen.getByText('200 pcs')).toBeInTheDocument()
    expect(screen.getByText('On Track')).toBeInTheDocument()
  })

  it('adds a loading transaction with cartons loaded, capturing date automatically', async () => {
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
    // Waits until the line is planned (has a shipment allocation), not
    // just until the SKU code text renders — see the note in the first
    // test above.
    fireEvent.click(await screen.findByRole('button', { name: 'Update Loading' }))
    const dialog = await screen.findByRole('dialog')

    expect(within(dialog).getByLabelText('SKU')).toHaveValue('CUST-SKU-1')
    expect(within(dialog).getByLabelText('Loadable Qty')).toHaveValue('1,600 pcs')
    expect(within(dialog).getByLabelText('Already Loaded Qty')).toHaveValue('1,400 pcs')

    fireEvent.change(within(dialog).getByLabelText('Cartons Loaded Now'), {
      target: { value: '2' },
    })

    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Update' }))

    await waitFor(() =>
      expect(mockedApi.createLoadingTransaction).toHaveBeenCalledWith(1, 1, 10, {
        date: expect.any(String),
        entry_type: 'CARTON_LOADED',
        cartons_loaded: 2,
        pouches_loaded: null,
        remarks: '',
      }),
    )
  })

  it('requires cartons loaded before saving', async () => {
    setupMocks()

    render(<ExportOrderLoadingTab exportOrderId={1} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Update Loading' }))
    const dialog = await screen.findByRole('dialog')

    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Update' }))

    expect(
      await within(dialog).findByText('Enter how many cartons were loaded.'),
    ).toBeInTheDocument()
    expect(mockedApi.createLoadingTransaction).not.toHaveBeenCalled()
  })

  it('renders the collapsed Loading Transactions feed and filters by SKU', async () => {
    setupMocks()
    const logEntry: LoadingTransactionLogEntry = {
      id: 1,
      date: '2026-08-12',
      export_order_line: 1,
      customer_sku_code: 'CUST-SKU-1',
      item_name: 'Areca Plate',
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
    await screen.findByText('1,600 pcs')

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

  it('shows an order line not yet on this shipment, and allows adding it', async () => {
    setupMocks()
    const created: ShipmentLine = {
      ...shipmentLine,
      id: 11,
      export_order_line: 2,
      customer_sku_code: 'CUST-SKU-2',
      planned_qty: 500,
    }
    mockedApi.createShipmentLine.mockResolvedValue(created)

    render(<ExportOrderLoadingTab exportOrderId={1} />)
    // Wait for the planned line (CUST-SKU-1) to settle first, so the
    // "Not Planned" check below unambiguously refers to CUST-SKU-2 only.
    await screen.findByText('1,600 pcs')

    expect(screen.getByText('CUST-SKU-2')).toBeInTheDocument()
    expect(screen.getByText('Not Planned')).toBeInTheDocument()

    const row = screen.getByText('CUST-SKU-2').closest('tr')
    if (!row) throw new Error('row not found')
    fireEvent.click(within(row).getByRole('button', { name: 'Add to Shipment' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByLabelText('Planned Qty (pieces)')).toHaveValue('500')

    fireEvent.click(within(dialog).getByRole('button', { name: 'Add to Shipment' }))

    await waitFor(() =>
      expect(mockedApi.createShipmentLine).toHaveBeenCalledWith(1, 1, {
        export_order_line: 2,
        planned_qty: 500,
        remarks: '',
      }),
    )
  })

  it('shows the create-a-shipment prompt when there are no shipments', async () => {
    mockedApi.listShipments.mockResolvedValue([])
    mockedApi.listExportOrderLines.mockResolvedValue([])

    render(<ExportOrderLoadingTab exportOrderId={1} />)

    expect(
      await screen.findByText('Create a shipment first, in the Shipping tab.'),
    ).toBeInTheDocument()
  })
})
