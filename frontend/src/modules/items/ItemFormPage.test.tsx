import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useParams } from 'react-router'
import ItemFormPage from './ItemFormPage'
import * as api from './api'
import * as customerMappingsApi from '../customer-mappings/api'
import type {
  ItemFieldRule,
  ItemFieldRuleField,
  ItemFieldRuleState,
  MaterialTypeListResponse,
  NamingTemplateListResponse,
  ProductTypeListResponse,
  ShapeListResponse,
  UOMListResponse,
} from './types'

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return { ...actual, useParams: vi.fn(() => ({})) }
})
vi.mock('./api')
vi.mock('../customer-mappings/api')

const mockedApi = vi.mocked(api)
const mockedCustomerMappingsApi = vi.mocked(customerMappingsApi)
const mockedUseParams = vi.mocked(useParams)

afterEach(() => {
  vi.clearAllMocks()
})

const productTypes: ProductTypeListResponse = {
  count: 1,
  next: null,
  previous: null,
  results: [
    { id: 1, name: 'Plate', short_code: 'PL', applicable_item_classes: [], is_active: true },
  ],
}
const materialTypes: MaterialTypeListResponse = {
  count: 1,
  next: null,
  previous: null,
  results: [
    { id: 2, name: 'Areca Palm', short_code: 'AL', applicable_item_classes: [], is_active: true },
  ],
}
const uoms: UOMListResponse = {
  count: 1,
  next: null,
  previous: null,
  results: [{ id: 3, code: 'PC', name: 'Piece', decimal_scale: 0, is_active: true }],
}
const shapes: ShapeListResponse = { count: 0, next: null, previous: null, results: [] }
const namingTemplates: NamingTemplateListResponse = {
  count: 0,
  next: null,
  previous: null,
  results: [],
}

// Mirrors the backend's seeded rule set exactly (see
// `apps/items/migrations/0013_seed_item_field_rules.py`).
const fieldRules: ItemFieldRule[] = (
  [
    ['RAW_MATERIAL', 'product_type', 'HIDDEN'],
    ['RAW_MATERIAL', 'material_type', 'REQUIRED'],
    ['RAW_MATERIAL', 'shape', 'HIDDEN'],
    ['RAW_MATERIAL', 'dimensions', 'HIDDEN'],
    ['WIP', 'product_type', 'REQUIRED'],
    ['WIP', 'material_type', 'REQUIRED'],
    ['WIP', 'shape', 'OPTIONAL'],
    ['WIP', 'dimensions', 'OPTIONAL'],
    ['FINISHED_GOOD', 'product_type', 'REQUIRED'],
    ['FINISHED_GOOD', 'material_type', 'REQUIRED'],
    ['FINISHED_GOOD', 'shape', 'OPTIONAL'],
    ['FINISHED_GOOD', 'dimensions', 'OPTIONAL'],
    ['PACKAGING_MATERIAL', 'product_type', 'REQUIRED'],
    ['PACKAGING_MATERIAL', 'material_type', 'HIDDEN'],
    ['PACKAGING_MATERIAL', 'shape', 'HIDDEN'],
    ['PACKAGING_MATERIAL', 'dimensions', 'OPTIONAL'],
    ['CONSUMABLE', 'product_type', 'OPTIONAL'],
    ['CONSUMABLE', 'material_type', 'HIDDEN'],
    ['CONSUMABLE', 'shape', 'HIDDEN'],
    ['CONSUMABLE', 'dimensions', 'HIDDEN'],
    ['SCRAP_BY_PRODUCT', 'product_type', 'OPTIONAL'],
    ['SCRAP_BY_PRODUCT', 'material_type', 'OPTIONAL'],
    ['SCRAP_BY_PRODUCT', 'shape', 'HIDDEN'],
    ['SCRAP_BY_PRODUCT', 'dimensions', 'HIDDEN'],
  ] as [ItemFieldRule['item_class'], ItemFieldRuleField, ItemFieldRuleState][]
).map(([item_class, field, state], index) => ({ id: index + 1, item_class, field, state }))

function setup() {
  mockedApi.listProductTypes.mockResolvedValue(productTypes)
  mockedApi.listMaterialTypes.mockResolvedValue(materialTypes)
  mockedApi.listUOMs.mockResolvedValue(uoms)
  mockedApi.listShapes.mockResolvedValue(shapes)
  mockedApi.listNamingTemplates.mockResolvedValue(namingTemplates)
  mockedApi.listItemFieldRules.mockResolvedValue(fieldRules)
}

describe('ItemFormPage', () => {
  it('shows Product Type for the default Finished Good class', async () => {
    setup()

    render(
      <MemoryRouter>
        <ItemFormPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Product Type')).toBeInTheDocument()
    expect(screen.getByText('Material')).toBeInTheDocument()
  })

  it('hides Product Type when Raw Material is selected', async () => {
    setup()

    render(
      <MemoryRouter>
        <ItemFormPage />
      </MemoryRouter>,
    )
    await screen.findByText('Product Type')

    fireEvent.click(screen.getByRole('radio', { name: 'Raw Material' }))

    await waitFor(() => expect(screen.queryByText('Product Type')).not.toBeInTheDocument())
    expect(screen.getByText('Material')).toBeInTheDocument()
  })

  it('hides Material when Packaging Material is selected', async () => {
    setup()

    render(
      <MemoryRouter>
        <ItemFormPage />
      </MemoryRouter>,
    )
    await screen.findByText('Material')

    fireEvent.click(screen.getByRole('radio', { name: 'Packaging Material' }))

    await waitFor(() => expect(screen.queryByText('Material')).not.toBeInTheDocument())
    expect(screen.getByText('Product Type')).toBeInTheDocument()
  })

  it('shows Dimensions but not Shape for Packaging Material', async () => {
    setup()

    render(
      <MemoryRouter>
        <ItemFormPage />
      </MemoryRouter>,
    )
    await screen.findByText('Shape (optional)')

    fireEvent.click(screen.getByRole('radio', { name: 'Packaging Material' }))

    await waitFor(() => expect(screen.queryByText('Shape (optional)')).not.toBeInTheDocument())
    expect(screen.getByText('Dimensions (optional)')).toBeInTheDocument()
  })

  it('marks Shape and Dimensions as required, not optional, when configured that way', async () => {
    setup()
    mockedApi.listItemFieldRules.mockResolvedValue(
      fieldRules.map((rule) =>
        rule.item_class === 'FINISHED_GOOD' && (rule.field === 'shape' || rule.field === 'dimensions')
          ? { ...rule, state: 'REQUIRED' }
          : rule,
      ),
    )

    render(
      <MemoryRouter>
        <ItemFormPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Shape')).toBeInTheDocument()
    expect(screen.queryByText('Shape (optional)')).not.toBeInTheDocument()
    expect(screen.getByText('Dimensions')).toBeInTheDocument()
    expect(screen.queryByText('Dimensions (optional)')).not.toBeInTheDocument()
  })

  it('creates an item with the entered values', async () => {
    setup()
    mockedApi.createItem.mockResolvedValue({
      id: 10,
      code: 'CON-002',
      name: 'Packing Tape',
      description: '',
      item_class: 'CONSUMABLE',
      product_type: null,
      product_type_name: '',
      material_type: null,
      material_type_name: '',
      shape: null,
      shape_name: '',
      length_in: null,
      breadth_in: null,
      height_mm: null,
      inventory_uom: 3,
      inventory_uom_code: 'PC',
      purchasable: false,
      manufacturable: false,
      stockable: false,
      sellable: false,
      lot_tracking: 'NONE',
      is_active: true,
      available_qty: 0,
    })

    render(
      <MemoryRouter>
        <ItemFormPage />
      </MemoryRouter>,
    )
    await screen.findByText('Product Type')

    fireEvent.click(screen.getByRole('radio', { name: 'Consumable' }))

    fireEvent.change(screen.getByLabelText('What should this item be called?'), {
      target: { value: 'Packing Tape' },
    })
    fireEvent.change(screen.getByLabelText('Item Code'), { target: { value: 'CON-002' } })

    fireEvent.mouseDown(screen.getByLabelText('Inventory Unit'))
    fireEvent.click(await screen.findByTitle('Piece (PC)'))

    fireEvent.click(screen.getByRole('checkbox', { name: 'Made' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Stocked' }))

    expect(screen.getByRole('checkbox', { name: 'Made' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Stocked' })).toBeChecked()

    fireEvent.click(screen.getByRole('button', { name: 'Create Item' }))

    await waitFor(() => expect(mockedApi.createItem).toHaveBeenCalled())
    const submitted = mockedApi.createItem.mock.calls[0][0]
    expect(submitted.name).toBe('Packing Tape')
    expect(submitted.code).toBe('CON-002')
    expect(submitted.inventory_uom).toBe(3)
    expect(submitted.manufacturable).toBe(true)
    expect(submitted.stockable).toBe(true)
    expect(submitted.sellable).toBe(false)
    expect(submitted.purchasable).toBe(false)
  })

  it('suggests a Name/Code using human-readable class and shape labels, not raw codes', async () => {
    setup()
    mockedApi.listShapes.mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [{ id: 9, name: 'Round', short_code: 'RD', is_active: true }],
    })
    mockedApi.listNamingTemplates.mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          id: 1,
          item_class: 'FINISHED_GOOD',
          product_type: null,
          product_type_name: '',
          shape: 9,
          shape_name: 'Round',
          name_pattern: '{class} — {shape} {dimension}',
          code_pattern: '{class_short}-{shape_short}-{dimension}',
          is_active: true,
        },
      ],
    })

    render(
      <MemoryRouter>
        <ItemFormPage />
      </MemoryRouter>,
    )
    await screen.findByText('Product Type')

    const shapeField = screen.getByText('Shape (optional)').closest('.ant-form-item') as HTMLElement
    fireEvent.mouseDown(within(shapeField).getByRole('combobox'))
    fireEvent.click(await screen.findByTitle('Round'))

    fireEvent.change(screen.getByPlaceholderText('Length'), { target: { value: '10' } })
    fireEvent.change(screen.getByPlaceholderText('Height'), { target: { value: '20' } })

    expect(await screen.findByText('Finished Good — Round 10RD20')).toBeInTheDocument()
    expect(await screen.findByText('FG-RD-10RD20')).toBeInTheDocument()
  })
})

describe('ItemFormPage — edit mode', () => {
  it('renders mapped customers as a reverse projection', async () => {
    setup()
    mockedUseParams.mockReturnValue({ id: '7' })
    mockedApi.getItem.mockResolvedValue({
      id: 7,
      code: 'SQ10',
      name: '10 Inch Plate',
      description: '',
      item_class: 'FINISHED_GOOD',
      product_type: 1,
      product_type_name: 'Plate',
      material_type: 2,
      material_type_name: 'Areca Palm',
      shape: null,
      shape_name: '',
      length_in: null,
      breadth_in: null,
      height_mm: null,
      inventory_uom: 3,
      inventory_uom_code: 'PC',
      purchasable: false,
      manufacturable: true,
      stockable: true,
      sellable: true,
      lot_tracking: 'NONE',
      is_active: true,
      available_qty: 0,
    })
    mockedCustomerMappingsApi.listCustomerProductMappings.mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          id: 5,
          customer: 1,
          customer_name: 'Acme Exports',
          item: 7,
          item_name: '10 Inch Plate',
          item_code: 'SQ10',
          customer_sku: 'SKU-A',
          mapping_code: 'CPM-1',
          is_active: true,
          current_version: {
            id: 1,
            mapping: 5,
            mapping_code: 'CPM-1',
            customer_name: 'Acme Exports',
            item_name: '10 Inch Plate',
            item_code: 'SQ10',
            version_number: 1,
            status: 'PUBLISHED',
            effective_from: null,
            effective_to: null,
            customer_sku: 'SKU-A',
            customer_description: '',
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
    })

    render(
      <MemoryRouter>
        <ItemFormPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Acme Exports')).toBeInTheDocument()
    expect(screen.getByText('SKU-A')).toBeInTheDocument()
    expect(screen.getByText('v1 — PUBLISHED')).toBeInTheDocument()
  })
})
