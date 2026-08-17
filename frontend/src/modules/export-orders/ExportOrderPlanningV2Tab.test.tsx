import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import ExportOrderPlanningV2Tab from './ExportOrderPlanningV2Tab'
import * as exportOrdersApi from './api'
import type { PackingMaterialRequirementSummary, SKUSupplyPlanSummary } from './types'

vi.mock('./api')

const mockedApi = vi.mocked(exportOrdersApi)

afterEach(() => {
  vi.clearAllMocks()
})

const planRow: SKUSupplyPlanSummary = {
  id: 1,
  export_order_line: 1,
  line_number: 1,
  customer_sku_code: 'CUST-SKU-1',
  product_sku_code: 'SKU-1',
  product_name: 'Areca Plate',
  required_qty: 20000,
  quantity_from_stock: 6000,
  quantity_to_produce: 10000,
  quantity_to_procure: 4000,
  planning_balance: 0,
  is_intentionally_underplanned: false,
  production_planned_start: null,
  production_expected_completion: null,
  procurement_planned_order_date: null,
  procurement_expected_receipt: null,
  overall_sku_expected_ready_date: '2026-08-20',
  responsible_team: null,
  responsible_team_detail: null,
  responsible_person: null,
  responsible_person_detail: null,
  risk_status: 'ON_TRACK',
  planning_status: 'IN_PROGRESS',
  remarks: '',
  created_at: null,
  updated_at: null,
  accepted_from_production: 0,
  accepted_from_procurement: 0,
}

function materialRow(overrides: Partial<PackingMaterialRequirementSummary>): PackingMaterialRequirementSummary {
  return {
    id: 1,
    material_type: 'CARTON',
    required_qty: 1500,
    manual_required_qty: null,
    available_stock: 800,
    ordered_qty: 0,
    shortage: 700,
    to_procure_qty: 700,
    manual_to_procure_qty: null,
    expected_arrival_date: '2026-08-20',
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
    ...overrides,
  }
}

function setupMocks() {
  mockedApi.listSkuSupplyPlans.mockResolvedValue([planRow])
  mockedApi.listPackingMaterialRequirements.mockImplementation((_id, materialType) => {
    if (materialType === 'CARTON') return Promise.resolve([materialRow({ material_type: 'CARTON' })])
    return Promise.resolve([])
  })
}

describe('ExportOrderPlanningV2Tab', () => {
  it('renders the line item planning and packing material tables', async () => {
    setupMocks()

    render(<ExportOrderPlanningV2Tab exportOrderId={1} />)

    expect(await screen.findAllByText('CUST-SKU-1')).not.toHaveLength(0)
    expect(screen.getAllByText('20,000 pcs').length).toBeGreaterThan(0)
    expect(screen.getByText('Cartons')).toBeInTheDocument()
    expect(screen.getByLabelText('To Procure — CUST-SKU-1 — Cartons')).toHaveValue('700')
  })

  it('saves edited quantities via Save Planning', async () => {
    setupMocks()
    mockedApi.updateSkuSupplyPlan.mockResolvedValue({ ...planRow, quantity_from_stock: 5000 })

    render(<ExportOrderPlanningV2Tab exportOrderId={1} />)
    await screen.findAllByText('CUST-SKU-1')

    fireEvent.change(screen.getByLabelText('Use Stock — CUST-SKU-1'), { target: { value: '5000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Planning' }))

    await waitFor(() =>
      expect(mockedApi.updateSkuSupplyPlan).toHaveBeenCalledWith(1, 1, {
        quantity_from_stock: 5000,
        quantity_to_produce: 10000,
        quantity_to_procure: 4000,
      }),
    )
  })

  it('saves an edited Available qty without touching To Procure', async () => {
    setupMocks()
    mockedApi.updatePackingMaterialRequirement.mockResolvedValue(
      materialRow({ material_type: 'CARTON', available_stock: 1500 }),
    )

    render(<ExportOrderPlanningV2Tab exportOrderId={1} />)
    await screen.findAllByText('CUST-SKU-1')

    fireEvent.change(screen.getByLabelText('Available — CUST-SKU-1 — Cartons'), {
      target: { value: '1500' },
    })
    // To Procure is independently editable now — editing Available alone
    // must not silently freeze it into a manual override.
    expect(screen.getByLabelText('To Procure — CUST-SKU-1 — Cartons')).toHaveValue('700')

    fireEvent.click(screen.getByRole('button', { name: 'Save Planning' }))

    await waitFor(() =>
      expect(mockedApi.updatePackingMaterialRequirement).toHaveBeenCalledWith(1, 1, 'CARTON', {
        available_stock: 1500,
      }),
    )
  })

  it('saves a manual To Procure override to cover packing damage, without touching Available', async () => {
    setupMocks()
    mockedApi.updatePackingMaterialRequirement.mockResolvedValue(
      materialRow({ material_type: 'CARTON', manual_to_procure_qty: 900, to_procure_qty: 900 }),
    )

    render(<ExportOrderPlanningV2Tab exportOrderId={1} />)
    await screen.findAllByText('CUST-SKU-1')

    fireEvent.change(screen.getByLabelText('To Procure — CUST-SKU-1 — Cartons'), {
      target: { value: '900' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save Planning' }))

    await waitFor(() =>
      expect(mockedApi.updatePackingMaterialRequirement).toHaveBeenCalledWith(1, 1, 'CARTON', {
        manual_to_procure_qty: 900,
      }),
    )
  })

  it('disables Place Order once the manual To Procure override is fully covered', async () => {
    setupMocks()

    render(<ExportOrderPlanningV2Tab exportOrderId={1} />)
    await screen.findAllByText('CUST-SKU-1')

    fireEvent.change(screen.getByLabelText('To Procure — CUST-SKU-1 — Cartons'), {
      target: { value: '0' },
    })

    expect(screen.getByRole('button', { name: 'Place Order' })).toBeDisabled()
  })

  it('shows a not-available message for Generate Material POs', async () => {
    setupMocks()

    render(<ExportOrderPlanningV2Tab exportOrderId={1} />)
    await screen.findAllByText('CUST-SKU-1')

    fireEvent.click(screen.getByRole('button', { name: /Generate Material POs/ }))

    expect(await screen.findByText("Generating Material POs isn't available yet.")).toBeInTheDocument()
  })
})
