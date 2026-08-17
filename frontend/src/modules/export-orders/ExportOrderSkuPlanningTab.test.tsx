import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ApiError } from '../../shared/api/http'
import ExportOrderSkuPlanningTab from './ExportOrderSkuPlanningTab'
import * as exportOrdersApi from './api'
import * as accountsApi from '../accounts/api'
import type { SKUSupplyPlanSummary } from './types'

vi.mock('./api')
vi.mock('../accounts/api')

const mockedApi = vi.mocked(exportOrdersApi)
const mockedAccountsApi = vi.mocked(accountsApi)

afterEach(() => {
  vi.clearAllMocks()
})

const row: SKUSupplyPlanSummary = {
  id: null,
  required_qty: 50000,
  quantity_from_stock: 5000,
  quantity_to_produce: 1000,
  quantity_to_procure: 2000,
  planning_balance: 42000,
  is_intentionally_underplanned: false,
  production_planned_start: null,
  production_expected_completion: null,
  procurement_planned_order_date: null,
  procurement_expected_receipt: null,
  overall_sku_expected_ready_date: null,
  responsible_team: null,
  responsible_team_detail: null,
  responsible_person: null,
  responsible_person_detail: null,
  risk_status: 'ON_TRACK',
  planning_status: 'NOT_STARTED',
  remarks: '',
  created_at: null,
  updated_at: null,
  export_order_line: 1,
  line_number: 1,
  customer_sku_code: 'CUST-SKU-1',
  product_sku_code: 'SKU-1',
  product_name: 'Areca Plate',
  accepted_from_production: 4500,
  accepted_from_procurement: 3200,
}

function setupMocks(rows: SKUSupplyPlanSummary[] = [row]) {
  mockedApi.listSkuSupplyPlans.mockResolvedValue(rows)
  mockedAccountsApi.listEmployees.mockResolvedValue({
    count: 0,
    next: null,
    previous: null,
    results: [],
  })
  mockedAccountsApi.listTeams.mockResolvedValue({ count: 0, next: null, previous: null, results: [] })
}

describe('ExportOrderSkuPlanningTab', () => {
  it('renders summary rows', async () => {
    setupMocks()

    render(<ExportOrderSkuPlanningTab exportOrderId={1} />)

    expect(await screen.findByText('CUST-SKU-1')).toBeInTheDocument()
    expect(screen.getByText('Areca Plate')).toBeInTheDocument()
    expect(screen.getByText('50000')).toBeInTheDocument()
    expect(screen.getByText('4500')).toBeInTheDocument()
    expect(screen.getByText('3200')).toBeInTheDocument()
    expect(screen.getByText('5000')).toBeInTheDocument()
    expect(screen.getByText('1000')).toBeInTheDocument()
    expect(screen.getByText('2000')).toBeInTheDocument()
    expect(screen.getByText('42000')).toBeInTheDocument()
    expect(screen.getByText('Not Started')).toBeInTheDocument()
    expect(screen.getByText('On Track')).toBeInTheDocument()
  })

  it('opens the drawer prefilled on row click', async () => {
    setupMocks()

    render(<ExportOrderSkuPlanningTab exportOrderId={1} />)
    await screen.findByText('CUST-SKU-1')

    fireEvent.click(screen.getByText('CUST-SKU-1'))

    expect(await screen.findByText('Plan — CUST-SKU-1')).toBeInTheDocument()
    expect(screen.getByDisplayValue('5000')).toBeInTheDocument()
    expect(screen.getByDisplayValue('1000')).toBeInTheDocument()
    expect(screen.getByDisplayValue('2000')).toBeInTheDocument()
  })

  it('submits an update and merges the response into the table', async () => {
    setupMocks()
    const updated = { ...row, quantity_from_stock: 20000, planning_balance: 27000 }
    mockedApi.updateSkuSupplyPlan.mockResolvedValue(updated)

    render(<ExportOrderSkuPlanningTab exportOrderId={1} />)
    await screen.findByText('CUST-SKU-1')
    fireEvent.click(screen.getByText('CUST-SKU-1'))
    await screen.findByText('Plan — CUST-SKU-1')

    fireEvent.change(screen.getByDisplayValue('5000'), { target: { value: '20000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(mockedApi.updateSkuSupplyPlan).toHaveBeenCalledWith(
        1,
        1,
        expect.objectContaining({ quantity_from_stock: 20000 }),
      ),
    )
    expect(await screen.findByText('27000')).toBeInTheDocument()
  })

  it('shows an error alert without closing the drawer on a rejected save', async () => {
    setupMocks()
    mockedApi.updateSkuSupplyPlan.mockRejectedValue(
      new ApiError('Remarks are required when intentionally planning short of the requirement.', 400),
    )

    render(<ExportOrderSkuPlanningTab exportOrderId={1} />)
    await screen.findByText('CUST-SKU-1')
    fireEvent.click(screen.getByText('CUST-SKU-1'))
    await screen.findByText('Plan — CUST-SKU-1')

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(
      await screen.findByText(
        'Remarks are required when intentionally planning short of the requirement.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('Plan — CUST-SKU-1')).toBeInTheDocument()
  })
})
