import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import Step2InputsForm from './Step2InputsForm'
import * as processesApi from './api'
import * as materialsApi from '../materials/api'
import * as productsApi from '../products/api'
import type { ProcessInput } from './types'
import type { MaterialListResponse } from '../materials/types'
import type { ProductListResponse } from '../products/types'

vi.mock('./api')
vi.mock('../materials/api')
vi.mock('../products/api')

const mockedApi = vi.mocked(processesApi)
const mockedMaterialsApi = vi.mocked(materialsApi)
const mockedProductsApi = vi.mocked(productsApi)

const materialsResponse: MaterialListResponse = {
  count: 1,
  next: null,
  previous: null,
  results: [{ id: 100, code: 'LEAF', name: 'Raw Leaf', unit: 'Kg', category: 'RAW_MATERIAL', is_active: true }],
}

const semiFinishedResponse: ProductListResponse = {
  count: 1,
  next: null,
  previous: null,
  results: [
    {
      id: 200,
      sku_code: 'UNTRIM-10SQ',
      name: 'Untrimmed Plate',
      description: '',
      base_unit: 'Piece',
      stage: 'SEMI_FINISHED',
      is_active: true,
    },
  ],
}

const leafInput: ProcessInput = {
  id: 10,
  sequence: 1,
  input_type: 'MATERIAL',
  item_id: 100,
  item_label: 'Raw Leaf (LEAF)',
  uom: 'Kg',
  quantity_capture: 'MANUAL',
  is_required: true,
}

function setupMocks() {
  mockedMaterialsApi.listMaterials.mockResolvedValue(materialsResponse)
  mockedProductsApi.listProducts.mockResolvedValue(semiFinishedResponse)
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('Step2InputsForm', () => {
  it('shows the header question and existing input rows', () => {
    setupMocks()

    render(
      <Step2InputsForm
        processName="Pressing"
        versionId={1}
        inputs={[leafInput]}
        batchLotMode="OPTIONAL"
        onSaved={vi.fn()}
        onContinue={vi.fn()}
      />,
    )

    expect(screen.getByText('What does "Pressing" receive or consume?')).toBeInTheDocument()
    expect(screen.getByText('Raw Leaf (LEAF)', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('Type: Material')).toBeInTheDocument()
    expect(screen.getByText('UOM: Kg')).toBeInTheDocument()
  })

  it('adds a Material input and saves the whole list', async () => {
    setupMocks()
    const onSaved = vi.fn()
    mockedApi.saveProcessInputs.mockResolvedValue({
      inputs: [leafInput],
      batch_lot_mode: 'OPTIONAL',
    })

    render(
      <Step2InputsForm
        processName="Pressing"
        versionId={1}
        inputs={[]}
        batchLotMode="OPTIONAL"
        onSaved={onSaved}
        onContinue={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByText('+ Add Input'))
    const dialog = await screen.findByRole('dialog')

    fireEvent.mouseDown(within(dialog).getByLabelText('Item'))
    const itemOptions = await screen.findAllByText('Raw Leaf (LEAF)')
    fireEvent.click(itemOptions[itemOptions.length - 1])

    fireEvent.click(within(dialog).getByRole('button', { name: 'Add Input' }))

    await waitFor(() =>
      expect(mockedApi.saveProcessInputs).toHaveBeenCalledWith(1, {
        inputs: [
          expect.objectContaining({ input_type: 'MATERIAL', item: 100, uom: 'Kg' }),
        ],
        batch_lot_mode: 'OPTIONAL',
      }),
    )
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ inputs: [leafInput], batch_lot_mode: 'OPTIONAL' }))
  })

  it('adds a WIP input sourced from semi-finished products', async () => {
    setupMocks()
    mockedApi.saveProcessInputs.mockResolvedValue({ inputs: [], batch_lot_mode: 'OPTIONAL' })

    render(
      <Step2InputsForm
        processName="Packing"
        versionId={1}
        inputs={[]}
        batchLotMode="OPTIONAL"
        onSaved={vi.fn()}
        onContinue={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByText('+ Add Input'))
    const dialog = await screen.findByRole('dialog')

    fireEvent.mouseDown(within(dialog).getByLabelText('Input Type'))
    const wipOptions = await screen.findAllByText('WIP')
    fireEvent.click(wipOptions[wipOptions.length - 1])

    fireEvent.mouseDown(within(dialog).getByLabelText('Item'))
    const itemOptions = await screen.findAllByText('Untrimmed Plate (UNTRIM-10SQ)')
    fireEvent.click(itemOptions[itemOptions.length - 1])

    fireEvent.click(within(dialog).getByRole('button', { name: 'Add Input' }))

    await waitFor(() =>
      expect(mockedApi.saveProcessInputs).toHaveBeenCalledWith(1, {
        inputs: [expect.objectContaining({ input_type: 'WIP', item: 200, uom: 'Piece' })],
        batch_lot_mode: 'OPTIONAL',
      }),
    )
  })

  it('deletes an input', async () => {
    setupMocks()
    mockedApi.saveProcessInputs.mockResolvedValue({ inputs: [], batch_lot_mode: 'OPTIONAL' })

    render(
      <Step2InputsForm
        processName="Pressing"
        versionId={1}
        inputs={[leafInput]}
        batchLotMode="OPTIONAL"
        onSaved={vi.fn()}
        onContinue={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByLabelText('Delete Raw Leaf (LEAF)'))

    await waitFor(() =>
      expect(mockedApi.saveProcessInputs).toHaveBeenCalledWith(1, {
        inputs: [],
        batch_lot_mode: 'OPTIONAL',
      }),
    )
  })

  it('changing Batch / Lot traceability saves immediately', async () => {
    setupMocks()
    mockedApi.saveProcessInputs.mockResolvedValue({ inputs: [leafInput], batch_lot_mode: 'REQUIRED' })

    render(
      <Step2InputsForm
        processName="Pressing"
        versionId={1}
        inputs={[leafInput]}
        batchLotMode="OPTIONAL"
        onSaved={vi.fn()}
        onContinue={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('radio', { name: 'Required' }))

    await waitFor(() =>
      expect(mockedApi.saveProcessInputs).toHaveBeenCalledWith(1, {
        inputs: [
          expect.objectContaining({ id: 10, input_type: 'MATERIAL', item: 100, uom: 'Kg' }),
        ],
        batch_lot_mode: 'REQUIRED',
      }),
    )
  })

  it('calls onContinue when Save & Continue is clicked', () => {
    setupMocks()
    const onContinue = vi.fn()

    render(
      <Step2InputsForm
        processName="Pressing"
        versionId={1}
        inputs={[leafInput]}
        batchLotMode="OPTIONAL"
        onSaved={vi.fn()}
        onContinue={onContinue}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Save & Continue →' }))

    expect(onContinue).toHaveBeenCalled()
  })
})
