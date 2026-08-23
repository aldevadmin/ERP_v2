import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import ExportOrderPackingTab from './ExportOrderPackingTab'
import * as exportOrdersApi from './api'
import * as accountsApi from '../accounts/api'
import type { PackingMonitorRow, PackingTransaction, PackingTransactionLogEntry } from './types'
import type { Employee, Team } from '../accounts/types'

vi.mock('./api')
vi.mock('../accounts/api')

const mockedApi = vi.mocked(exportOrdersApi)
const mockedAccountsApi = vi.mocked(accountsApi)

afterEach(() => {
  vi.clearAllMocks()
})

const readinessRow: PackingMonitorRow = {
  export_order_line: 1,
  line_number: 1,
  customer_sku_code: 'CUST-SKU-1',
  item_code: 'SKU-1',
  item_name: 'Areca Plate',
  required_cartons: 20,
  packed_cartons: 16,
  extra_pouches: 0,
  balance: 4,
  progress: 0.8,
  packable_qty: 1000,
  packed_pieces: 800,
  balance_pieces: 200,
  progress_pieces: 0.8,
  last_transaction_at: '2026-08-10T09:15:00Z',
}

const employee: Employee = { id: 1, employee_code: 'EMP-1', full_name: 'Ravi K', team: null }
const team: Team = { id: 1, name: 'Morning Shift' }

function setupMocks() {
  mockedApi.listPackingMonitor.mockResolvedValue([readinessRow])
  mockedApi.listSkuSupplyPlans.mockResolvedValue([])
  mockedApi.listPackingTransactionsLog.mockResolvedValue({
    count: 0,
    next: null,
    previous: null,
    results: [],
  })
  mockedAccountsApi.listEmployees.mockResolvedValue({
    count: 1,
    next: null,
    previous: null,
    results: [employee],
  })
  mockedAccountsApi.listTeams.mockResolvedValue({
    count: 1,
    next: null,
    previous: null,
    results: [team],
  })
}

async function setShiftTeam(dialog: HTMLElement, value: string) {
  const input = within(dialog).getByLabelText('Shift / Team')
  fireEvent.mouseDown(input)
  fireEvent.change(input, { target: { value } })
  await screen.findByRole('option', { name: value })
  fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', keyCode: 13 })
}

describe('ExportOrderPackingTab', () => {
  it('shows a readiness row with pieces-based figures and status', async () => {
    setupMocks()

    render(<ExportOrderPackingTab exportOrderId={1} />)

    expect(await screen.findByText('CUST-SKU-1')).toBeInTheDocument()
    expect(screen.getByText('1,000 pcs')).toBeInTheDocument()
    expect(screen.getByText('800 pcs')).toBeInTheDocument()
    expect(screen.getByText('200 pcs')).toBeInTheDocument()
    expect(screen.getByText('On Track')).toBeInTheDocument()
  })

  it('adds a manual packing transaction with cartons packed', async () => {
    setupMocks()
    const created: PackingTransaction = {
      id: 1,
      date: '2026-08-15',
      entry_type: 'CARTON_COMPLETED',
      cartons_packed: 5,
      pouches_packed: null,
      calculated_pieces: 250,
      packed_by: 1,
      packed_by_detail: employee,
      shift_team: 'Morning Shift',
      remarks: '',
      entered_by: 'Coordinator',
      created_at: '2026-08-15T00:00:00Z',
    }
    mockedApi.createPackingTransaction.mockResolvedValue(created)

    render(<ExportOrderPackingTab exportOrderId={1} />)
    await screen.findByText('CUST-SKU-1')

    fireEvent.click(screen.getByRole('button', { name: /Add Manual Transaction/ }))
    const dialog = await screen.findByRole('dialog')

    expect(within(dialog).getByLabelText('SKU')).not.toBeDisabled()

    fireEvent.mouseDown(within(dialog).getByLabelText('SKU'))
    fireEvent.click(await screen.findByText('CUST-SKU-1 — Areca Plate'))

    fireEvent.change(within(dialog).getByLabelText('Cartons Packed'), { target: { value: '5' } })

    fireEvent.mouseDown(within(dialog).getByLabelText('Packed By'))
    fireEvent.click(await screen.findByText('Ravi K'))

    await setShiftTeam(dialog, 'Morning Shift')

    fireEvent.click(within(dialog).getByRole('button', { name: 'Add Transaction' }))

    await waitFor(() =>
      expect(mockedApi.createPackingTransaction).toHaveBeenCalledWith(1, 1, {
        date: expect.any(String),
        entry_type: 'CARTON_COMPLETED',
        cartons_packed: 5,
        pouches_packed: null,
        packed_by: 1,
        shift_team: 'Morning Shift',
        remarks: '',
      }),
    )
  })

  it('rejects entering both pouches and cartons in the same transaction', async () => {
    setupMocks()

    render(<ExportOrderPackingTab exportOrderId={1} />)
    await screen.findByText('CUST-SKU-1')

    fireEvent.click(screen.getByRole('button', { name: /Add Manual Transaction/ }))
    const dialog = await screen.findByRole('dialog')

    fireEvent.change(within(dialog).getByLabelText('Pouches Packed'), { target: { value: '5' } })
    fireEvent.change(within(dialog).getByLabelText('Cartons Packed'), { target: { value: '5' } })

    fireEvent.click(within(dialog).getByRole('button', { name: 'Add Transaction' }))

    expect(
      await within(dialog).findAllByText('Enter pouches OR cartons, not both.'),
    ).not.toHaveLength(0)
    expect(mockedApi.createPackingTransaction).not.toHaveBeenCalled()
  })

  it('prefills and locks the SKU when opened from a readiness row', async () => {
    setupMocks()

    render(<ExportOrderPackingTab exportOrderId={1} />)
    await screen.findByText('CUST-SKU-1')

    const row = screen.getByText('CUST-SKU-1').closest('tr')
    if (!row) throw new Error('row not found')
    fireEvent.click(within(row).getByRole('button', { name: /Add Transaction/ }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByLabelText('SKU')).toBeDisabled()
  })

  it('renders recent transactions and filters by SKU', async () => {
    setupMocks()
    const transaction: PackingTransactionLogEntry = {
      id: 1,
      date: '2026-08-12',
      export_order_line: 1,
      customer_sku_code: 'CUST-SKU-1',
      item_name: 'Areca Plate',
      entry_type: 'CARTON_COMPLETED',
      cartons_packed: 16,
      pouches_packed: null,
      calculated_pieces: 800,
      packed_by_detail: employee,
      shift_team: 'Morning Shift',
      remarks: '',
      entered_by: 'coord1',
      created_at: '2026-08-12T09:15:00Z',
    }
    mockedApi.listPackingTransactionsLog.mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [transaction],
    })

    render(<ExportOrderPackingTab exportOrderId={1} />)
    await screen.findAllByText('CUST-SKU-1')

    expect(await screen.findByText('Ravi K')).toBeInTheDocument()

    fireEvent.mouseDown(screen.getByLabelText('Filter transactions by SKU'))
    fireEvent.click(await screen.findByText('CUST-SKU-1 — Areca Plate'))

    await waitFor(() =>
      expect(mockedApi.listPackingTransactionsLog).toHaveBeenLastCalledWith(1, {
        line: 1,
        page: 1,
        pageSize: 10,
      }),
    )
  })
})
