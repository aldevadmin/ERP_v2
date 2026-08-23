import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import ExportOrderFulfilmentTab from './ExportOrderFulfilmentTab'
import * as exportOrdersApi from './api'
import * as vendorsApi from '../vendors/api'
import type {
  FulfilmentTransaction,
  ProcurementRequirementSummary,
  ProductionRequirementSummary,
  ProductionTransaction,
  SKUSupplyPlanSummary,
} from './types'
import type { Vendor } from '../vendors/types'

vi.mock('./api')
vi.mock('../vendors/api')

const mockedApi = vi.mocked(exportOrdersApi)
const mockedVendorsApi = vi.mocked(vendorsApi)

afterEach(() => {
  vi.clearAllMocks()
})

const productionRow: ProductionRequirementSummary = {
  export_order_line: 1,
  line_number: 1,
  customer_sku_code: 'CUST-SKU-1',
  item_code: 'SKU-1',
  item_name: 'Areca Plate',
  planned_qty: 600,
  cumulative_produced: 400,
  cumulative_accepted: 400,
  cumulative_rejected: 0,
  progress: 400 / 600,
  balance: 200,
  status: 'IN_PROGRESS',
  last_transaction_at: '2026-08-10T09:15:00Z',
}

// Procurement-only SKU — no planned production at all, regression check
// for the union-by-line-id combine logic (a naive `production.map(...)`
// base would silently drop this row).
const procurementOnlyRow: ProcurementRequirementSummary = {
  export_order_line: 2,
  line_number: 2,
  customer_sku_code: 'CUST-SKU-2',
  item_code: 'SKU-2',
  item_name: 'Bowl',
  planned_qty: 300,
  cumulative_received: 300,
  cumulative_accepted: 300,
  cumulative_rejected: 0,
  progress: 1,
  balance: 0,
  status: 'READY',
  last_transaction_at: '2026-08-11T09:15:00Z',
}

const supplyPlans: SKUSupplyPlanSummary[] = []

const vendor: Vendor = { id: 1, code: 'V1', name: 'Acme Vendor', category: '', is_active: true }

function setupMocks() {
  mockedApi.listProductionRequirements.mockResolvedValue([productionRow])
  mockedApi.listProcurementRequirements.mockResolvedValue([procurementOnlyRow])
  mockedApi.listSkuSupplyPlans.mockResolvedValue(supplyPlans)
  mockedApi.listFulfilmentTransactions.mockResolvedValue({
    count: 0,
    next: null,
    previous: null,
    results: [],
  })
  mockedVendorsApi.listVendors.mockResolvedValue({
    count: 1,
    next: null,
    previous: null,
    results: [vendor],
  })
}

async function setPartyTeam(dialog: HTMLElement, value: string) {
  const input = within(dialog).getByLabelText('Party / Team')
  fireEvent.mouseDown(input)
  fireEvent.change(input, { target: { value } })
  await screen.findByRole('option', { name: value })
  fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', keyCode: 13 })
}

describe('ExportOrderFulfilmentTab', () => {
  it('shows a readiness row for every SKU, including a procurement-only one', async () => {
    setupMocks()

    render(<ExportOrderFulfilmentTab exportOrderId={1} />)

    expect(await screen.findByText('CUST-SKU-1')).toBeInTheDocument()
    expect(screen.getByText('CUST-SKU-2')).toBeInTheDocument()
    expect(screen.getByText('Production')).toBeInTheDocument()
    expect(screen.getByText('Procurement')).toBeInTheDocument()
    expect(screen.getByText('Complete')).toBeInTheDocument() // SKU-2, fully accepted
  })

  it('adds a manual Production transaction with a free-text party/team', async () => {
    setupMocks()
    const created: ProductionTransaction = {
      id: 1,
      date: '2026-08-15',
      quantity_produced: 100,
      quantity_accepted: 100,
      quantity_rejected: 0,
      party_team: 'Production Team A',
      remarks: '',
      source: 'MANUAL',
      entered_by: 'Coordinator',
      created_at: '2026-08-15T00:00:00Z',
    }
    mockedApi.createProductionTransaction.mockResolvedValue(created)

    render(<ExportOrderFulfilmentTab exportOrderId={1} />)
    await screen.findByText('CUST-SKU-1')

    fireEvent.click(screen.getByRole('button', { name: /Add Manual Transaction/ }))
    const dialog = await screen.findByRole('dialog')

    expect(within(dialog).getByLabelText('SKU')).not.toBeDisabled()

    fireEvent.mouseDown(within(dialog).getByLabelText('SKU'))
    fireEvent.click(await screen.findByText('CUST-SKU-1 — Areca Plate'))

    await setPartyTeam(dialog, 'Production Team A')

    fireEvent.change(within(dialog).getByLabelText('Received or Produced Qty'), {
      target: { value: '100' },
    })
    fireEvent.change(within(dialog).getByLabelText('Accepted Qty'), { target: { value: '100' } })

    fireEvent.click(within(dialog).getByRole('button', { name: 'Add Transaction' }))

    await waitFor(() =>
      expect(mockedApi.createProductionTransaction).toHaveBeenCalledWith(1, 1, {
        date: expect.any(String),
        quantity_produced: 100,
        quantity_accepted: 100,
        quantity_rejected: 0,
        party_team: 'Production Team A',
        remarks: '',
      }),
    )
  })

  it('prefills and locks the SKU when opened from a readiness row', async () => {
    setupMocks()

    render(<ExportOrderFulfilmentTab exportOrderId={1} />)
    await screen.findByText('CUST-SKU-1')

    const row = screen.getByText('CUST-SKU-1').closest('tr')
    if (!row) throw new Error('row not found')
    fireEvent.click(within(row).getByRole('button', { name: /Add Transaction/ }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByLabelText('SKU')).toBeDisabled()
  })

  it('renders recent transactions and filters by SKU', async () => {
    setupMocks()
    const transaction: FulfilmentTransaction = {
      id: 'production-1',
      date: '2026-08-12',
      source: 'PRODUCTION',
      export_order_line: 1,
      customer_sku_code: 'CUST-SKU-1',
      item_name: 'Areca Plate',
      party_team: 'Production Team A',
      quantity: 400,
      quantity_accepted: 400,
      quantity_rejected: 0,
      remarks: '',
      entered_by: 'coord1',
      created_at: '2026-08-12T09:15:00Z',
    }
    mockedApi.listFulfilmentTransactions.mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [transaction],
    })

    render(<ExportOrderFulfilmentTab exportOrderId={1} />)
    await screen.findAllByText('CUST-SKU-1')

    expect(await screen.findByText('Production Team A')).toBeInTheDocument()

    fireEvent.mouseDown(screen.getByLabelText('Filter transactions by SKU'))
    fireEvent.click(await screen.findByText('CUST-SKU-1 — Areca Plate'))

    await waitFor(() =>
      expect(mockedApi.listFulfilmentTransactions).toHaveBeenLastCalledWith(1, {
        line: 1,
        page: 1,
      }),
    )
  })
})
