import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useParams } from 'react-router'
import ToolingFormPage from './ToolingFormPage'
import * as api from './api'
import * as itemsApi from '../items/api'
import type { Tooling, ToolingTypeListResponse } from './types'
import type { ItemListResponse } from '../items/types'

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return { ...actual, useParams: vi.fn() }
})
vi.mock('./api')
vi.mock('../items/api')

const mockedApi = vi.mocked(api)
const mockedItemsApi = vi.mocked(itemsApi)
const mockedUseParams = vi.mocked(useParams)

const plate: ItemListResponse = {
  count: 1,
  next: null,
  previous: null,
  results: [
    {
      id: 1,
      code: 'PLATE-10',
      name: '10" Round Plate',
      description: '',
      item_class: 'FINISHED_GOOD',
      product_type: null,
      product_type_name: '',
      material_type: null,
      material_type_name: '',
      shape: null,
      shape_name: '',
      length: null,
      breadth: null,
      height: null,
      length_uom: null,
      breadth_uom: null,
      height_uom: null,
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

const toolingTypes: ToolingTypeListResponse = {
  count: 1,
  next: null,
  previous: null,
  results: [{ id: 1, name: 'Mould', is_active: true }],
}

beforeEach(() => {
  mockedUseParams.mockReturnValue({})
  mockedItemsApi.listItems.mockResolvedValue(plate)
  mockedApi.listToolingTypes.mockResolvedValue(toolingTypes)
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('ToolingFormPage — create', () => {
  it('creates tooling and reveals the compatible items section', async () => {
    const created: Tooling = {
      id: 5,
      code: 'MLD-101',
      name: '10" Round Mould',
      tooling_type: 1,
      tooling_type_name: 'Mould',
      cavity_count: 1,
      default_standard_rate: 60,
      is_active: true,
      notes: '',
      compatibilities: [],
      compatibilities_count: 0,
    }
    mockedApi.createTooling.mockResolvedValue(created)

    render(
      <MemoryRouter>
        <ToolingFormPage />
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByLabelText('Tooling Name'), {
      target: { value: '10" Round Mould' },
    })
    fireEvent.change(screen.getByLabelText('Tooling Code'), { target: { value: 'MLD-101' } })
    fireEvent.mouseDown(screen.getByLabelText('Type'))
    const typeOptions = await screen.findAllByText('Mould')
    fireEvent.click(typeOptions[typeOptions.length - 1])

    fireEvent.click(screen.getByRole('button', { name: 'Save Tooling' }))

    await waitFor(() =>
      expect(mockedApi.createTooling).toHaveBeenCalledWith(
        expect.objectContaining({ name: '10" Round Mould', code: 'MLD-101', tooling_type: 1 }),
      ),
    )
    expect(await screen.findByText('Compatible Items / SKUs')).toBeInTheDocument()
  })
})

describe('ToolingFormPage — edit', () => {
  const existing: Tooling = {
    id: 7,
    code: 'MLD-205',
    name: '8" Round Mould',
    tooling_type: 1,
    tooling_type_name: 'Mould',
    cavity_count: 1,
    default_standard_rate: 70,
    is_active: true,
    notes: '',
    compatibilities: [
      { id: 1, item: 1, item_name: '10" Round Plate', item_code: 'PLATE-10', process_definition: null, process_definition_name: '' },
    ],
    compatibilities_count: 1,
  }

  beforeEach(() => {
    mockedUseParams.mockReturnValue({ id: '7' })
    mockedApi.getTooling.mockResolvedValue(existing)
  })

  it('loads existing tooling with Code locked and shows compatible items', async () => {
    render(
      <MemoryRouter>
        <ToolingFormPage />
      </MemoryRouter>,
    )

    expect(await screen.findByDisplayValue('8" Round Mould')).toBeInTheDocument()
    expect(screen.getByLabelText('Tooling Code')).toHaveValue('MLD-205')
    expect(screen.getByLabelText('Tooling Code')).toBeDisabled()
    expect(screen.getByText('10" Round Plate (PLATE-10)')).toBeInTheDocument()
  })

  it('saves compatible items when the selection changes', async () => {
    mockedApi.saveToolingCompatibilities.mockResolvedValue({
      ...existing,
      compatibilities: [],
      compatibilities_count: 0,
    })

    render(
      <MemoryRouter>
        <ToolingFormPage />
      </MemoryRouter>,
    )
    await screen.findByDisplayValue('8" Round Mould')

    const removeIcon = document.querySelector('.ant-select-selection-item-remove')
    expect(removeIcon).toBeTruthy()
    fireEvent.click(removeIcon!)

    await waitFor(() =>
      expect(mockedApi.saveToolingCompatibilities).toHaveBeenCalledWith(7, {
        compatibilities: [],
      }),
    )
  })
})
