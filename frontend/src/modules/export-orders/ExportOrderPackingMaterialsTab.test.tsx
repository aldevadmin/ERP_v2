import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ApiError } from '../../shared/api/http'
import ExportOrderPackingMaterialsTab from './ExportOrderPackingMaterialsTab'
import * as exportOrdersApi from './api'
import * as accountsApi from '../accounts/api'
import type { PackingMaterialRequirementSummary } from './types'

vi.mock('./api')
vi.mock('../accounts/api')

const mockedApi = vi.mocked(exportOrdersApi)
const mockedAccountsApi = vi.mocked(accountsApi)

afterEach(() => {
  vi.clearAllMocks()
})

const row: PackingMaterialRequirementSummary = {
  id: null,
  material_type: 'CARTON',
  required_qty: 1000,
  manual_required_qty: null,
  available_stock: 600,
  ordered_qty: 300,
  shortage: 400,
  to_procure_qty: 400,
  manual_to_procure_qty: null,
  expected_arrival_date: '2026-02-01',
  received_qty: null,
  accepted_qty: null,
  responsible_person: null,
  responsible_person_detail: null,
  status: 'IN_PROGRESS',
  remarks: '',
  created_at: null,
  updated_at: null,
  export_order_line: 1,
  line_number: 1,
  customer_sku_code: 'CUST-SKU-1',
  product_sku_code: 'SKU-1',
  product_name: 'Areca Plate',
}

function setupMocks(rows: PackingMaterialRequirementSummary[] = [row]) {
  mockedApi.listPackingMaterialRequirements.mockResolvedValue(rows)
  mockedAccountsApi.listEmployees.mockResolvedValue({
    count: 0,
    next: null,
    previous: null,
    results: [],
  })
}

describe('ExportOrderPackingMaterialsTab', () => {
  it('renders summary rows and the worked shortage example', async () => {
    setupMocks()

    render(
      <ExportOrderPackingMaterialsTab exportOrderId={1} materialType="CARTON" title="Cartons" />,
    )

    expect(await screen.findByText('CUST-SKU-1')).toBeInTheDocument()
    expect(screen.getByText('Areca Plate')).toBeInTheDocument()
    expect(screen.getByText('In Progress')).toBeInTheDocument()

    // Scoped to the table, since the Statistic summary row above can show
    // the same numbers (e.g. Total Shortage) and would otherwise collide.
    const table = screen.getByRole('table')
    expect(within(table).getByText('1000')).toBeInTheDocument()
    expect(within(table).getByText('600')).toBeInTheDocument()
    // "400" appears twice: Shortage, and To Procure (defaults to shortage
    // until a manual override is set).
    const dangerCells = within(table).getAllByText('400')
    expect(dangerCells).toHaveLength(2)
    // AntD wraps `strong` text in a nested <strong>; the `danger` class
    // lives on the ancestor <span class="ant-typography ...">.
    for (const cell of dangerCells) {
      expect(cell.closest('.ant-typography')?.className).toMatch(/danger/)
    }

    // The Statistic summary row, scanned at a glance.
    expect(screen.getByText('Total Required')).toBeInTheDocument()
    expect(screen.getByText('SKUs Short')).toBeInTheDocument()
  })

  it('opens the drawer prefilled and does not show a Required input for Cartons', async () => {
    setupMocks()

    render(
      <ExportOrderPackingMaterialsTab exportOrderId={1} materialType="CARTON" title="Cartons" />,
    )
    await screen.findByText('CUST-SKU-1')

    fireEvent.click(screen.getByText('CUST-SKU-1'))

    expect(await screen.findByText('Cartons — CUST-SKU-1')).toBeInTheDocument()
    expect(screen.getByText('Required: 1,000')).toBeInTheDocument()
    expect(screen.getByDisplayValue('600')).toBeInTheDocument()
    expect(screen.getByDisplayValue('300')).toBeInTheDocument()
    expect(screen.queryByLabelText('Required')).not.toBeInTheDocument()
  })

  it('shows an editable Required field for Box Labels', async () => {
    const boxLabelRow: PackingMaterialRequirementSummary = {
      ...row,
      material_type: 'BOX_LABEL',
      required_qty: 500,
      manual_required_qty: 500,
    }
    setupMocks([boxLabelRow])

    render(
      <ExportOrderPackingMaterialsTab
        exportOrderId={1}
        materialType="BOX_LABEL"
        title="Box Labels"
      />,
    )
    await screen.findByText('CUST-SKU-1')

    fireEvent.click(screen.getByText('CUST-SKU-1'))

    expect(await screen.findByLabelText('Required')).toHaveValue('500')
  })

  it('submits an update and merges the response into the table', async () => {
    setupMocks()
    const updated = { ...row, available_stock: 1000, shortage: 0 }
    mockedApi.updatePackingMaterialRequirement.mockResolvedValue(updated)

    render(
      <ExportOrderPackingMaterialsTab exportOrderId={1} materialType="CARTON" title="Cartons" />,
    )
    await screen.findByText('CUST-SKU-1')
    fireEvent.click(screen.getByText('CUST-SKU-1'))
    await screen.findByText('Cartons — CUST-SKU-1')

    fireEvent.change(screen.getByDisplayValue('600'), { target: { value: '1000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(mockedApi.updatePackingMaterialRequirement).toHaveBeenCalledWith(
        1,
        1,
        'CARTON',
        expect.objectContaining({ available_stock: 1000 }),
      ),
    )
    // Scoped to the table: the Statistic summary row also shows "0" for
    // both Total Shortage and SKUs Short once shortage clears.
    expect(
      await within(screen.getByRole('table')).findByText('0'),
    ).toBeInTheDocument() // shortage, now cleared
  })

  it('shows an error alert without closing the drawer on a rejected save', async () => {
    setupMocks()
    mockedApi.updatePackingMaterialRequirement.mockRejectedValue(
      new ApiError('Required is calculated automatically for this material.', 400),
    )

    render(
      <ExportOrderPackingMaterialsTab exportOrderId={1} materialType="CARTON" title="Cartons" />,
    )
    await screen.findByText('CUST-SKU-1')
    fireEvent.click(screen.getByText('CUST-SKU-1'))
    await screen.findByText('Cartons — CUST-SKU-1')

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(
      await screen.findByText('Required is calculated automatically for this material.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Cartons — CUST-SKU-1')).toBeInTheDocument()
  })
})
