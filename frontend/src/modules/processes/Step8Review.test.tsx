import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import Step8Review from './Step8Review'
import * as processesApi from './api'
import type { Process, ProcessInput, ProcessOutput, ProcessParameter } from './types'

vi.mock('./api')

const mockedApi = vi.mocked(processesApi)

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

const temperature: ProcessParameter = {
  id: 1,
  sequence: 1,
  label: 'Temperature',
  code: 'TEMPERATURE',
  data_type: 'NUMBER',
  unit: '°C',
  capture_at: 'START',
  is_required: true,
  default_value: '',
}

const process: Process = {
  id: 1,
  name: 'Pressing',
  code: 'PRESS',
  is_active: true,
  version_id: 100,
  version_number: 1,
  version_status: 'DRAFT',
  category: 1,
  category_name: 'Production',
  work_centre_requirement: 'MACHINE',
  operator_required: true,
  standard_rate_config_level: 'WORK_CENTRE',
  capture_mode: 'POSITION_LEVEL',
  position_label: 'Mould Position',
  default_position_count: 6,
  allow_work_centre_override: true,
  allow_different_sku_per_position: true,
  allow_manual_standard_rate: true,
  reserve_machine_derived_rate: true,
  batch_lot_mode: 'OPTIONAL',
  transaction_frequency: 'SHIFT',
  partial_output_forward: true,
  allow_over_production: false,
  over_production_tolerance_percent: null,
  input_consumption_mode: 'MANUAL',
  completion_mode: 'OPERATOR',
  qc_requirement: 'NONE',
  allow_correction_with_audit_trail: true,
  allow_destructive_delete: false,
  permit_machine_generated_source: true,
  description: '',
  inputs: [leafInput],
  outputs: [plateOutput],
  parameters: [temperature],
}

function renderReview(overrides: Partial<Process> = {}, onActivated = vi.fn(), onEditStep = vi.fn()) {
  return render(
    <MemoryRouter>
      <Step8Review
        process={{ ...process, ...overrides }}
        onActivated={onActivated}
        onEditStep={onEditStep}
      />
    </MemoryRouter>,
  )
}

describe('Step8Review', () => {
  it('renders the flow diagram, execution summary and parameters', () => {
    renderReview()

    expect(screen.getByText('Review "Pressing" before activating')).toBeInTheDocument()
    expect(screen.getByText('Raw Leaf (LEAF)')).toBeInTheDocument()
    expect(screen.getByText('Untrimmed Plate (UNTRIM-10SQ)')).toBeInTheDocument()
    expect(screen.getByText('Good')).toBeInTheDocument()
    expect(screen.getByText('Per Mould Position')).toBeInTheDocument()
    expect(screen.getByText('6 (work-centre override allowed)')).toBeInTheDocument()
    expect(screen.getByText('Shift based')).toBeInTheDocument()
    expect(screen.getByText('Temperature')).toBeInTheDocument()
  })

  it('shows empty-state text when there are no inputs, outputs or parameters', () => {
    renderReview({ inputs: [], outputs: [], parameters: [] })

    expect(screen.getAllByText('None configured')).toHaveLength(2)
    expect(screen.getByText('No parameters configured')).toBeInTheDocument()
  })

  it('activates the process and shows warnings on success', async () => {
    const onActivated = vi.fn()
    mockedApi.activateProcess.mockResolvedValue({
      version_status: 'ACTIVE',
      warnings: ['No work centre has been mapped to this process yet.'],
    })

    renderReview({}, onActivated)

    fireEvent.click(screen.getByRole('button', { name: 'Save & Activate' }))

    await waitFor(() => expect(mockedApi.activateProcess).toHaveBeenCalledWith(100))
    expect(await screen.findByText('This process is active.')).toBeInTheDocument()
    expect(
      screen.getByText('No work centre has been mapped to this process yet.'),
    ).toBeInTheDocument()
    expect(onActivated).toHaveBeenCalledWith({
      version_status: 'ACTIVE',
      warnings: ['No work centre has been mapped to this process yet.'],
    })
  })

  it('shows the blocking error message when activation fails', async () => {
    const { ApiError } = await import('../../shared/api/http')
    mockedApi.activateProcess.mockRejectedValue(new ApiError('At least one output is required.', 400))

    renderReview()

    fireEvent.click(screen.getByRole('button', { name: 'Save & Activate' }))

    expect(await screen.findByText('At least one output is required.')).toBeInTheDocument()
    expect(screen.getByText('Save & Activate')).toBeInTheDocument()
  })

  it('does not show Save & Activate for an already-active process', () => {
    renderReview({ version_status: 'ACTIVE' })

    expect(screen.queryByRole('button', { name: 'Save & Activate' })).not.toBeInTheDocument()
    expect(screen.getByText('This process is active.')).toBeInTheDocument()
  })

  it('calls onEditStep when jumping back to Inputs, Outputs or Rules', () => {
    const onEditStep = vi.fn()
    renderReview({}, vi.fn(), onEditStep)

    fireEvent.click(screen.getByRole('button', { name: '← Edit Inputs' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit Outputs' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit Rules' }))

    expect(onEditStep).toHaveBeenNthCalledWith(1, 'inputs')
    expect(onEditStep).toHaveBeenNthCalledWith(2, 'outputs')
    expect(onEditStep).toHaveBeenNthCalledWith(3, 'rules')
  })
})
