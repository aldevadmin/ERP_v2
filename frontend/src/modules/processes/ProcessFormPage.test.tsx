import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useNavigate, useParams } from 'react-router'
import ProcessFormPage from './ProcessFormPage'
import * as processesApi from './api'
import type { Process, ProcessCategoryListResponse } from './types'

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return { ...actual, useNavigate: vi.fn(), useParams: vi.fn() }
})
vi.mock('./api')

const mockedApi = vi.mocked(processesApi)
const mockedUseNavigate = vi.mocked(useNavigate)
const mockedUseParams = vi.mocked(useParams)
const navigateMock = vi.fn()

const categoriesResponse: ProcessCategoryListResponse = {
  count: 1,
  next: null,
  previous: null,
  results: [{ id: 1, name: 'Production', is_active: true }],
}

beforeEach(() => {
  mockedUseNavigate.mockReturnValue(navigateMock)
  mockedUseParams.mockReturnValue({})
  mockedApi.listProcessCategories.mockResolvedValue(categoriesResponse)
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('ProcessFormPage — wizard shell', () => {
  it('shows all 8 steps', async () => {
    render(
      <MemoryRouter>
        <ProcessFormPage />
      </MemoryRouter>,
    )

    for (const label of [
      'Basics',
      'Inputs',
      'Outputs',
      'Work Centre',
      'Output Capture',
      'Parameters',
      'Rules',
      'Review',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  it('shows a prompt instead of the Review summary before Basics has been saved', async () => {
    render(
      <MemoryRouter>
        <ProcessFormPage />
      </MemoryRouter>,
    )
    await screen.findByText('Production')

    fireEvent.click(screen.getByText('Review'))

    expect(
      await screen.findByText('Save Basics first to review this process.'),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Process Code')).not.toBeInTheDocument()
  })

  it('shows a prompt instead of the Inputs editor before Basics has been saved', async () => {
    render(
      <MemoryRouter>
        <ProcessFormPage />
      </MemoryRouter>,
    )
    await screen.findByText('Production')

    fireEvent.click(screen.getByText('Inputs'))

    expect(
      await screen.findByText('Save Basics first to configure Inputs.'),
    ).toBeInTheDocument()
  })

  it('shows a prompt instead of the Work Centre editor before Basics has been saved', async () => {
    render(
      <MemoryRouter>
        <ProcessFormPage />
      </MemoryRouter>,
    )
    await screen.findByText('Production')

    fireEvent.click(screen.getByText('Work Centre'))

    expect(
      await screen.findByText('Save Basics first to configure Work Centre.'),
    ).toBeInTheDocument()
  })
})

describe('ProcessFormPage — Basics', () => {
  it('auto-fills Process Code from the name until the code is edited by hand', async () => {
    render(
      <MemoryRouter>
        <ProcessFormPage />
      </MemoryRouter>,
    )
    await screen.findByText('Production')

    fireEvent.change(screen.getByLabelText('What should this process be called?'), {
      target: { value: 'Cold Pressing' },
    })

    expect(screen.getByLabelText('Process Code')).toHaveValue('COLD_PRESSING')

    fireEvent.change(screen.getByLabelText('Process Code'), { target: { value: 'CUSTOM' } })
    fireEvent.change(screen.getByLabelText('What should this process be called?'), {
      target: { value: 'Cold Pressing Two' },
    })

    expect(screen.getByLabelText('Process Code')).toHaveValue('CUSTOM')
  })

  it('creates the process from Basics and moves to the real Inputs step on Continue', async () => {
    const created: Process = {
      id: 20,
      name: 'Pressing',
      code: 'PRESSING',
      is_active: true,
      version_id: 200,
      version_number: 1,
      version_status: 'DRAFT',
      category: 1,
      category_name: 'Production',
      work_centre_requirement: '',
      operator_required: true,
      standard_rate_config_level: '',
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
      inputs: [],
      outputs: [],
      parameters: [],
      description: '',
    }
    mockedApi.createProcess.mockResolvedValue(created)

    render(
      <MemoryRouter>
        <ProcessFormPage />
      </MemoryRouter>,
    )
    await screen.findByText('Production')

    fireEvent.change(screen.getByLabelText('What should this process be called?'), {
      target: { value: 'Pressing' },
    })
    fireEvent.click(screen.getByLabelText('Production'))

    fireEvent.click(screen.getByRole('button', { name: 'Continue →' }))

    await waitFor(() =>
      expect(mockedApi.createProcess).toHaveBeenCalledWith({
        name: 'Pressing',
        code: 'PRESSING',
        category: 1,
        description: undefined,
      }),
    )
    expect(
      await screen.findByText('What does "Pressing" receive or consume?'),
    ).toBeInTheDocument()
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('saves and returns to the list when Save Draft is clicked', async () => {
    const created: Process = {
      id: 21,
      name: 'Pressing',
      code: 'PRESSING',
      is_active: true,
      version_id: 210,
      version_number: 1,
      version_status: 'DRAFT',
      category: 1,
      category_name: 'Production',
      work_centre_requirement: '',
      operator_required: true,
      standard_rate_config_level: '',
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
      inputs: [],
      outputs: [],
      parameters: [],
      description: '',
    }
    mockedApi.createProcess.mockResolvedValue(created)

    render(
      <MemoryRouter>
        <ProcessFormPage />
      </MemoryRouter>,
    )
    await screen.findByText('Production')

    fireEvent.change(screen.getByLabelText('What should this process be called?'), {
      target: { value: 'Pressing' },
    })
    fireEvent.click(screen.getByLabelText('Production'))

    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }))

    await waitFor(() => expect(mockedApi.createProcess).toHaveBeenCalled())
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/processes'))
  })
})

describe('ProcessFormPage — edit', () => {
  const existing: Process = {
    id: 5,
    name: 'Washing',
    code: 'WASH',
    is_active: true,
    version_id: 50,
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
    inputs: [],
    outputs: [],
    parameters: [],
    description: 'Rinses raw leaf.',
  }

  beforeEach(() => {
    mockedUseParams.mockReturnValue({ id: '5' })
    mockedApi.getProcess.mockResolvedValue(existing)
    mockedApi.updateProcess.mockResolvedValue(existing)
  })

  it('loads the existing Basics fields with Process Code locked', async () => {
    render(
      <MemoryRouter>
        <ProcessFormPage />
      </MemoryRouter>,
    )

    expect(await screen.findByDisplayValue('Washing')).toBeInTheDocument()
    expect(screen.getByLabelText('Process Code')).toHaveValue('WASH')
    expect(screen.getByLabelText('Process Code')).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Continue →' }))

    await waitFor(() =>
      expect(mockedApi.updateProcess).toHaveBeenCalledWith(5, {
        name: 'Washing',
        code: 'WASH',
        category: 1,
        description: 'Rinses raw leaf.',
      }),
    )
  })

  it('shows the Inputs editor once the process has loaded', async () => {
    render(
      <MemoryRouter>
        <ProcessFormPage />
      </MemoryRouter>,
    )
    await screen.findByDisplayValue('Washing')

    fireEvent.click(screen.getByText('Inputs'))

    expect(
      await screen.findByText('What does "Washing" receive or consume?'),
    ).toBeInTheDocument()
  })

  it('shows the Work Centre editor once the process has loaded', async () => {
    render(
      <MemoryRouter>
        <ProcessFormPage />
      </MemoryRouter>,
    )
    await screen.findByDisplayValue('Washing')

    fireEvent.click(screen.getByText('Work Centre'))

    expect(await screen.findByText('Where does "Washing" happen?')).toBeInTheDocument()
  })
})
