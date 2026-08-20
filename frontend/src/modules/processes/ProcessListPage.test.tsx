import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useNavigate } from 'react-router'
import ProcessListPage from './ProcessListPage'
import * as processesApi from './api'
import type {
  Process,
  ProcessCategoryListResponse,
  ProcessInput,
  ProcessListResponse,
  ProcessOutput,
} from './types'

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return { ...actual, useNavigate: vi.fn() }
})
vi.mock('./api')

const mockedApi = vi.mocked(processesApi)
const mockedUseNavigate = vi.mocked(useNavigate)
const navigateMock = vi.fn()

beforeEach(() => {
  mockedUseNavigate.mockReturnValue(navigateMock)
})

afterEach(() => {
  vi.clearAllMocks()
})

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

const plateOutput: ProcessOutput = {
  id: 20,
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

const scrapOutput: ProcessOutput = {
  ...plateOutput,
  id: 21,
  sequence: 2,
  item_type: 'MATERIAL',
  item_id: 300,
  item_label: 'Wood Scrap (SCRAP)',
  classification_name: 'Scrap',
}

const process1: Process = {
  id: 1,
  name: 'Washing',
  code: 'WASH',
  is_active: true,
  version_id: 10,
  version_number: 1,
  version_status: 'DRAFT',
  category: 1,
  category_name: 'Production',
  work_centre_requirement: 'STATION',
  operator_required: true,
  standard_rate_config_level: 'WORK_CENTRE',
  capture_mode: '',
  position_label: '',
  default_position_count: null,
  allow_work_centre_override: true,
  allow_different_sku_per_position: true,
  allow_manual_standard_rate: true,
  reserve_machine_derived_rate: true,
  batch_lot_mode: 'OPTIONAL',
  transaction_frequency: '',
  partial_output_forward: true,
  allow_over_production: false,
  over_production_tolerance_percent: null,
  input_consumption_mode: 'MANUAL',
  completion_mode: 'OPERATOR',
  qc_requirement: 'NONE',
  allow_correction_with_audit_trail: true,
  allow_destructive_delete: false,
  permit_machine_generated_source: true,
  inputs: [leafInput],
  outputs: [plateOutput, scrapOutput],
  parameters: [],
  description: '',
}

const categoriesResponse: ProcessCategoryListResponse = {
  count: 1,
  next: null,
  previous: null,
  results: [{ id: 1, name: 'Production', is_active: true }],
}

function setupMocks(processes: Process[] = [process1]) {
  const response: ProcessListResponse = { count: processes.length, next: null, previous: null, results: processes }
  mockedApi.listProcesses.mockResolvedValue(response)
  mockedApi.listProcessCategories.mockResolvedValue(categoriesResponse)
}

describe('ProcessListPage', () => {
  it('renders processes with Input/Output counts, category and resource labels', async () => {
    setupMocks()

    render(
      <MemoryRouter>
        <ProcessListPage />
      </MemoryRouter>,
    )

    const nameCell = await screen.findByText('Washing')
    const row = nameCell.closest('tr')
    if (!row) throw new Error('row not found')

    expect(within(row).getByText('Production')).toBeInTheDocument()
    expect(within(row).getByText('Station')).toBeInTheDocument()
    expect(within(row).getByText('1')).toBeInTheDocument()
    expect(within(row).getByText('2')).toBeInTheDocument()
  })

  it('filters by category', async () => {
    setupMocks()

    render(
      <MemoryRouter>
        <ProcessListPage />
      </MemoryRouter>,
    )
    await screen.findByText('Washing')

    fireEvent.mouseDown(screen.getByLabelText('Category'))
    const options = await screen.findAllByText('Production')
    fireEvent.click(options[options.length - 1])

    await waitFor(() =>
      expect(mockedApi.listProcesses).toHaveBeenLastCalledWith({
        search: undefined,
        category: 1,
        isActive: true,
      }),
    )
  })

  it('duplicates a process and navigates to the new copy', async () => {
    setupMocks()
    const copy: Process = { ...process1, id: 2, name: 'Washing (Copy)' }
    mockedApi.duplicateProcess.mockResolvedValue(copy)

    render(
      <MemoryRouter>
        <ProcessListPage />
      </MemoryRouter>,
    )
    await screen.findByText('Washing')

    fireEvent.click(screen.getByRole('button', { name: 'Actions — Washing' }))
    fireEvent.click(await screen.findByText('Duplicate'))

    await waitFor(() => expect(mockedApi.duplicateProcess).toHaveBeenCalledWith(1))
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/processes/2/edit'))
  })

  it('deactivates a process and refreshes the list', async () => {
    setupMocks()
    mockedApi.updateProcess.mockResolvedValue({ ...process1, is_active: false })

    render(
      <MemoryRouter>
        <ProcessListPage />
      </MemoryRouter>,
    )
    await screen.findByText('Washing')

    fireEvent.click(screen.getByRole('button', { name: 'Actions — Washing' }))
    fireEvent.click(await screen.findByText('Deactivate'))

    await waitFor(() =>
      expect(mockedApi.updateProcess).toHaveBeenCalledWith(1, { is_active: false }),
    )
  })
})
