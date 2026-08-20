import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ApiError } from '../../shared/api/http'
import ExportOrderLinesTab from './ExportOrderLinesTab'
import * as exportOrdersApi from './api'
import * as productsApi from '../products/api'
import type { CustomerSKUMappingListResponse, ProductListResponse } from '../products/types'
import type { ExportOrderLine, PackingMaterialRequirementSummary } from './types'

vi.mock('./api')
vi.mock('../products/api')

const mockedApi = vi.mocked(exportOrdersApi)
const mockedProductsApi = vi.mocked(productsApi)

afterEach(() => {
  vi.clearAllMocks()
})

const existingLine: ExportOrderLine = {
  id: 1,
  line_number: 1,
  customer_sku_code: 'CUST-SKU-1',
  customer_description: '10 Inch Plate',
  product: 1,
  product_sku_code: 'SKU-1',
  product_name: 'Areca Plate',
  original_customer_quantity: 100,
  original_customer_unit: 'PIECE',
  pieces_per_pouch: 10,
  pouches_per_carton: 5,
  pieces_per_carton: 50,
  has_retail_sticker: null,
  required_pieces: 100,
  required_pouches: 10,
  required_cartons: 2,
  required_stickers: 0,
  created_at: '2026-01-15T00:00:00Z',
  updated_at: '2026-01-15T00:00:00Z',
}

const skuMappingsResponse: CustomerSKUMappingListResponse = {
  count: 1,
  next: null,
  previous: null,
  results: [
    {
      id: 1,
      customer: 1,
      customer_name: 'Acme Exports',
      customer_sku_code: 'CUST-SKU-1',
      customer_description: '10 Inch Plate',
      product: 1,
      product_sku_code: 'SKU-1',
      product_name: 'Areca Plate',
      pieces_per_pouch: 10,
      pouches_per_carton: 5,
      pieces_per_carton: 50,
      pouch_height_inches: null,
      carton_ply_rating: '',
      carton_length_mm: null,
      carton_breadth_mm: null,
      carton_height_mm: null,
      carton_net_weight_kg: null,
      carton_gross_weight_kg: null,
      pouch_thickness_microns: null,
      pouch_length_mm: null,
      pouch_breadth_mm: null,
      pouch_height_mm: null,
      has_retail_sticker: null,
      retail_sticker_comments: '',
      has_silica_gel: null,
      other_packing_requirements: '',
      files: [],
    },
  ],
}

const productsResponse: ProductListResponse = {
  count: 1,
  next: null,
  previous: null,
  results: [
    {
      id: 1,
      sku_code: 'SKU-1',
      name: 'Areca Plate',
      description: '',
      base_unit: 'Piece',
      stage: 'FINISHED_GOOD',
      is_active: true,
    },
  ],
}

function setupMocks(lines: ExportOrderLine[] = []) {
  mockedApi.listExportOrderLines.mockResolvedValue(lines)
  mockedProductsApi.listCustomerSkuMappings.mockResolvedValue(skuMappingsResponse)
  mockedProductsApi.listProducts.mockResolvedValue(productsResponse)
  mockedApi.listPackingMaterialRequirements.mockResolvedValue([])
}

describe('ExportOrderLinesTab', () => {
  it('renders existing lines with computed columns', async () => {
    setupMocks([existingLine])

    render(<ExportOrderLinesTab exportOrderId={1} customerId={1} />)

    expect(await screen.findByText('CUST-SKU-1')).toBeInTheDocument()
    expect(screen.getByText('10 Inch Plate')).toBeInTheDocument()
    expect(screen.getByText('SKU-1')).toBeInTheDocument()
    expect(screen.getByText('Areca Plate')).toBeInTheDocument()
    expect(screen.getByText('50')).toBeInTheDocument() // pieces per carton
    expect(screen.getAllByText('10').length).toBe(2) // pieces per pouch + required pouches
    expect(screen.getByText('2')).toBeInTheDocument() // required cartons
    expect(screen.getByText('0')).toBeInTheDocument() // required stickers
  })

  it('shows a packing-material status popover on the Required Cartons cell', async () => {
    setupMocks([existingLine])
    const cartonRequirement: PackingMaterialRequirementSummary = {
      id: 5,
      material_type: 'CARTON',
      required_qty: 2,
      manual_required_qty: null,
      available_stock: 1,
      ordered_qty: 1,
      shortage: 1,
      to_procure_qty: 1,
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
    mockedApi.listPackingMaterialRequirements.mockImplementation((_id, materialType) =>
      Promise.resolve(materialType === 'CARTON' ? [cartonRequirement] : []),
    )

    render(<ExportOrderLinesTab exportOrderId={1} customerId={1} />)
    await screen.findByText('CUST-SKU-1')

    await waitFor(() =>
      expect(mockedApi.listPackingMaterialRequirements).toHaveBeenCalledWith(1, 'CARTON'),
    )
    const infoIcon = await screen.findByRole('img', { name: 'info-circle' })
    fireEvent.mouseOver(infoIcon)

    expect(await screen.findByText('Ordered: 1')).toBeInTheDocument()
  })

  it('adds a line via the entry row using an autocomplete match', async () => {
    setupMocks([])
    const created: ExportOrderLine = { ...existingLine, id: 2 }
    mockedApi.createExportOrderLine.mockResolvedValue(created)

    render(<ExportOrderLinesTab exportOrderId={1} customerId={1} />)
    await waitFor(() => expect(mockedProductsApi.listCustomerSkuMappings).toHaveBeenCalled())

    fireEvent.change(screen.getByRole('combobox', { name: 'Customer SKU' }), {
      target: { value: 'CUST-SKU-1' },
    })
    await waitFor(() =>
      expect(screen.getByPlaceholderText('Customer Description')).toHaveValue('10 Inch Plate'),
    )

    fireEvent.change(screen.getByPlaceholderText('Quantity'), { target: { value: '100' } })

    fireEvent.click(screen.getByRole('button', { name: 'Add Line' }))

    await waitFor(() =>
      expect(mockedApi.createExportOrderLine).toHaveBeenCalledWith(1, {
        customer_sku_code: 'CUST-SKU-1',
        customer_description: '10 Inch Plate',
        product: 1,
        original_customer_quantity: 100,
        original_customer_unit: 'PIECE',
      }),
    )
    expect(await screen.findByText('CUST-SKU-1')).toBeInTheDocument()
  })

  it('adds a free-typed PIECE line with no matching mapping', async () => {
    setupMocks([])
    const created: ExportOrderLine = {
      ...existingLine,
      id: 3,
      customer_sku_code: 'NEW-SKU',
      product: null,
      product_sku_code: null,
      product_name: null,
      pieces_per_pouch: null,
      pouches_per_carton: null,
      pieces_per_carton: null,
      required_pouches: null,
      required_cartons: null,
    }
    mockedApi.createExportOrderLine.mockResolvedValue(created)

    render(<ExportOrderLinesTab exportOrderId={1} customerId={1} />)
    await waitFor(() => expect(mockedProductsApi.listCustomerSkuMappings).toHaveBeenCalled())

    fireEvent.change(screen.getByRole('combobox', { name: 'Customer SKU' }), {
      target: { value: 'NEW-SKU' },
    })
    fireEvent.change(screen.getByPlaceholderText('Quantity'), { target: { value: '50' } })

    fireEvent.click(screen.getByRole('button', { name: 'Add Line' }))

    await waitFor(() =>
      expect(mockedApi.createExportOrderLine).toHaveBeenCalledWith(1, {
        customer_sku_code: 'NEW-SKU',
        customer_description: '',
        product: null,
        original_customer_quantity: 50,
        original_customer_unit: 'PIECE',
      }),
    )
  })

  it('surfaces a server validation error without losing entered values', async () => {
    setupMocks([])
    mockedApi.createExportOrderLine.mockRejectedValue(
      new ApiError('No packing configuration found for this customer/SKU.', 400),
    )

    render(<ExportOrderLinesTab exportOrderId={1} customerId={1} />)
    await waitFor(() => expect(mockedProductsApi.listCustomerSkuMappings).toHaveBeenCalled())

    fireEvent.change(screen.getByRole('combobox', { name: 'Customer SKU' }), {
      target: { value: 'CUST-SKU-2' },
    })
    fireEvent.change(screen.getByPlaceholderText('Quantity'), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Line' }))

    expect(
      await screen.findByText('No packing configuration found for this customer/SKU.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Customer SKU' })).toHaveValue('CUST-SKU-2')
  })

  it('edits an existing line inline', async () => {
    setupMocks([existingLine])
    const updated: ExportOrderLine = {
      ...existingLine,
      original_customer_quantity: 150,
      required_pieces: 150,
    }
    mockedApi.updateExportOrderLine.mockResolvedValue(updated)

    render(<ExportOrderLinesTab exportOrderId={1} customerId={1} />)
    await screen.findByText('CUST-SKU-1')

    fireEvent.click(screen.getByRole('button', { name: 'Edit line' }))

    const quantityInput = screen.getByDisplayValue('100')
    fireEvent.change(quantityInput, { target: { value: '150' } })

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(mockedApi.updateExportOrderLine).toHaveBeenCalledWith(
        1,
        1,
        expect.objectContaining({ original_customer_quantity: 150 }),
      ),
    )
  })

  it('deletes a line after confirmation', async () => {
    setupMocks([existingLine])
    mockedApi.deleteExportOrderLine.mockResolvedValue(undefined)

    render(<ExportOrderLinesTab exportOrderId={1} customerId={1} />)
    await screen.findByText('CUST-SKU-1')

    fireEvent.click(screen.getByRole('button', { name: 'Delete line' }))
    fireEvent.click(await screen.findByRole('button', { name: 'OK' }))

    await waitFor(() => expect(mockedApi.deleteExportOrderLine).toHaveBeenCalledWith(1, 1))
    await waitFor(() => expect(screen.queryByText('CUST-SKU-1')).not.toBeInTheDocument())
  })
})
