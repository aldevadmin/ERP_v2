import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { ApiError } from '../../shared/api/http'
import ExportOrderLinesTab from './ExportOrderLinesTab'
import * as exportOrdersApi from './api'
import * as customerMappingsApi from '../customer-mappings/api'
import * as itemsApi from '../items/api'
import type { CustomerProductMappingListResponse } from '../customer-mappings/types'
import type { ItemListResponse } from '../items/types'
import type { ExportOrderLine, PackingMaterialRequirementSummary } from './types'

vi.mock('./api')
vi.mock('../customer-mappings/api')
vi.mock('../items/api')

const mockedApi = vi.mocked(exportOrdersApi)
const mockedCustomerMappingsApi = vi.mocked(customerMappingsApi)
const mockedItemsApi = vi.mocked(itemsApi)

afterEach(() => {
  vi.clearAllMocks()
})

const existingLine: ExportOrderLine = {
  id: 1,
  line_number: 1,
  customer_sku_code: 'CUST-SKU-1',
  customer_description: '10 Inch Plate',
  item: 1,
  item_code: 'SKU-1',
  item_name: 'Areca Plate',
  original_customer_quantity: 100,
  original_customer_unit: 'PIECE',
  pieces_per_pouch: 10,
  pouches_per_carton: 5,
  pieces_per_carton: 50,
  has_retail_sticker: null,
  source_mapping_version: null,
  required_pieces: 100,
  required_pouches: 10,
  required_cartons: 2,
  required_stickers: 0,
  created_at: '2026-01-15T00:00:00Z',
  updated_at: '2026-01-15T00:00:00Z',
}

const skuMappingsResponse: CustomerProductMappingListResponse = {
  count: 1,
  next: null,
  previous: null,
  results: [
    {
      id: 1,
      customer: 1,
      customer_name: 'Acme Exports',
      item: 1,
      item_code: 'SKU-1',
      item_name: 'Areca Plate',
      customer_sku: 'CUST-SKU-1',
      mapping_code: 'CPM-1',
      is_active: true,
      current_version: {
        id: 1,
        mapping: 1,
        mapping_code: 'CPM-1',
        customer_name: 'Acme Exports',
        item_name: 'Areca Plate',
        item_code: 'SKU-1',
        version_number: 1,
        status: 'PUBLISHED',
        effective_from: null,
        effective_to: null,
        customer_sku: 'CUST-SKU-1',
        customer_description: '10 Inch Plate',
        packaging_profile_version: null,
        packaging_profile_name: '',
        packaging_profile_version_number: null,
        selling_uom: null,
        selling_uom_code: '',
        unit_price: null,
        currency: '',
        barcode: '',
        requirements: [],
        files: [],
      },
    },
  ],
}

const itemsResponse: ItemListResponse = {
  count: 1,
  next: null,
  previous: null,
  results: [
    {
      id: 1,
      code: 'SKU-1',
      name: 'Areca Plate',
      description: '',
      item_class: 'FINISHED_GOOD',
      product_type: null,
      product_type_name: '',
      material_type: null,
      material_type_name: '',
      inventory_uom: null,
      inventory_uom_code: '',
      purchasable: false,
      manufacturable: true,
      stockable: true,
      sellable: true,
      lot_tracking: 'NONE',
      is_active: true,
      available_qty: 0,
    },
  ],
}

function setupMocks(lines: ExportOrderLine[] = []) {
  mockedApi.listExportOrderLines.mockResolvedValue(lines)
  mockedCustomerMappingsApi.listCustomerProductMappings.mockResolvedValue(skuMappingsResponse)
  mockedItemsApi.listItems.mockResolvedValue(itemsResponse)
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
      item_code: 'SKU-1',
      item_name: 'Areca Plate',
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
    await waitFor(() => expect(mockedCustomerMappingsApi.listCustomerProductMappings).toHaveBeenCalled())

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
        item: 1,
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
      item: null,
      item_code: null,
      item_name: null,
      pieces_per_pouch: null,
      pouches_per_carton: null,
      pieces_per_carton: null,
      required_pouches: null,
      required_cartons: null,
    }
    mockedApi.createExportOrderLine.mockResolvedValue(created)

    render(<ExportOrderLinesTab exportOrderId={1} customerId={1} />)
    await waitFor(() => expect(mockedCustomerMappingsApi.listCustomerProductMappings).toHaveBeenCalled())

    fireEvent.change(screen.getByRole('combobox', { name: 'Customer SKU' }), {
      target: { value: 'NEW-SKU' },
    })
    fireEvent.change(screen.getByPlaceholderText('Quantity'), { target: { value: '50' } })

    fireEvent.click(screen.getByRole('button', { name: 'Add Line' }))

    await waitFor(() =>
      expect(mockedApi.createExportOrderLine).toHaveBeenCalledWith(1, {
        customer_sku_code: 'NEW-SKU',
        customer_description: '',
        item: null,
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
    await waitFor(() => expect(mockedCustomerMappingsApi.listCustomerProductMappings).toHaveBeenCalled())

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

  it('offers a link to create a mapping when none exists for this customer/item', async () => {
    setupMocks([])
    mockedApi.createExportOrderLine.mockRejectedValue(
      new ApiError(
        'No published Customer Product Mapping is effective for this customer, item, and order date.',
        400,
      ),
    )

    render(
      <MemoryRouter>
        <ExportOrderLinesTab exportOrderId={1} customerId={1} />
      </MemoryRouter>,
    )
    await waitFor(() => expect(mockedCustomerMappingsApi.listCustomerProductMappings).toHaveBeenCalled())

    fireEvent.change(screen.getByRole('combobox', { name: 'Customer SKU' }), {
      target: { value: 'CUST-SKU-2' },
    })
    fireEvent.change(screen.getByPlaceholderText('Quantity'), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Line' }))

    const link = await screen.findByRole('link', { name: 'Create one' })
    expect(link).toHaveAttribute('href', '/customer-product-mappings/new')
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
