import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import Step3OutputsForm from './Step3OutputsForm'
import * as processesApi from './api'
import * as materialsApi from '../materials/api'
import * as productsApi from '../products/api'
import type { OutputClassificationListResponse, ProcessOutput } from './types'
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
  results: [{ id: 300, code: 'SCRAP', name: 'Wood Scrap', unit: 'Kg', category: 'RAW_MATERIAL', is_active: true }],
}

const productsResponse: ProductListResponse = {
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

const classificationsResponse: OutputClassificationListResponse = {
  count: 2,
  next: null,
  previous: null,
  results: [
    { id: 1, name: 'Good', is_active: true },
    { id: 2, name: 'Scrap', is_active: true },
  ],
}

const plateOutput: ProcessOutput = {
  id: 10,
  sequence: 1,
  item_type: 'PRODUCT',
  item_id: 200,
  item_label: 'Untrimmed Plate (UNTRIM-10SQ)',
  uom: 'Piece',
  classification: 1,
  classification_name: 'Good',
  can_move_forward: true,
  creates_traceable_output: true,
  default_storage_destination: '',
}

function setupMocks() {
  mockedMaterialsApi.listMaterials.mockResolvedValue(materialsResponse)
  mockedProductsApi.listProducts.mockResolvedValue(productsResponse)
  mockedApi.listOutputClassifications.mockResolvedValue(classificationsResponse)
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('Step3OutputsForm', () => {
  it('shows the header question and existing output rows', () => {
    setupMocks()

    render(
      <Step3OutputsForm
        processName="Sorting"
        versionId={1}
        outputs={[plateOutput]}
        onSaved={vi.fn()}
        onContinue={vi.fn()}
      />,
    )

    expect(screen.getByText('What can "Sorting" produce?')).toBeInTheDocument()
    expect(screen.getByText('Untrimmed Plate (UNTRIM-10SQ)', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('Classification: Good')).toBeInTheDocument()
  })

  it('adds a Product output and saves the whole list', async () => {
    setupMocks()
    const onSaved = vi.fn()
    mockedApi.saveProcessOutputs.mockResolvedValue([plateOutput])

    render(
      <Step3OutputsForm
        processName="Sorting"
        versionId={1}
        outputs={[]}
        onSaved={onSaved}
        onContinue={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByText('+ Add Output'))
    const dialog = await screen.findByRole('dialog')

    fireEvent.mouseDown(within(dialog).getByLabelText('Output Item'))
    const itemOptions = await screen.findAllByText('Untrimmed Plate (UNTRIM-10SQ)')
    fireEvent.click(itemOptions[itemOptions.length - 1])

    fireEvent.mouseDown(within(dialog).getByLabelText('Classification'))
    const classificationOptions = await screen.findAllByText('Good')
    fireEvent.click(classificationOptions[classificationOptions.length - 1])

    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(mockedApi.saveProcessOutputs).toHaveBeenCalledWith(1, {
        outputs: [
          expect.objectContaining({
            item_type: 'PRODUCT',
            item: 200,
            uom: 'Piece',
            classification: 1,
          }),
        ],
      }),
    )
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith([plateOutput]))
  })

  it('adds a Material output sourced from the Materials master', async () => {
    setupMocks()
    mockedApi.saveProcessOutputs.mockResolvedValue([])

    render(
      <Step3OutputsForm
        processName="Pressing"
        versionId={1}
        outputs={[]}
        onSaved={vi.fn()}
        onContinue={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByText('+ Add Output'))
    const dialog = await screen.findByRole('dialog')

    fireEvent.mouseDown(within(dialog).getByLabelText('Output Item'))
    const itemOptions = await screen.findAllByText('Wood Scrap (SCRAP)')
    fireEvent.click(itemOptions[itemOptions.length - 1])

    fireEvent.mouseDown(within(dialog).getByLabelText('Classification'))
    const classificationOptions = await screen.findAllByText('Scrap')
    fireEvent.click(classificationOptions[classificationOptions.length - 1])

    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(mockedApi.saveProcessOutputs).toHaveBeenCalledWith(1, {
        outputs: [
          expect.objectContaining({
            item_type: 'MATERIAL',
            item: 300,
            uom: 'Kg',
            classification: 2,
          }),
        ],
      }),
    )
  })

  it('deletes an output', async () => {
    setupMocks()
    mockedApi.saveProcessOutputs.mockResolvedValue([])

    render(
      <Step3OutputsForm
        processName="Sorting"
        versionId={1}
        outputs={[plateOutput]}
        onSaved={vi.fn()}
        onContinue={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByLabelText('Delete Untrimmed Plate (UNTRIM-10SQ)'))

    await waitFor(() =>
      expect(mockedApi.saveProcessOutputs).toHaveBeenCalledWith(1, { outputs: [] }),
    )
  })

  it('calls onContinue when Save & Continue is clicked', () => {
    setupMocks()
    const onContinue = vi.fn()

    render(
      <Step3OutputsForm
        processName="Sorting"
        versionId={1}
        outputs={[plateOutput]}
        onSaved={vi.fn()}
        onContinue={onContinue}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Save & Continue →' }))

    expect(onContinue).toHaveBeenCalled()
  })
})
