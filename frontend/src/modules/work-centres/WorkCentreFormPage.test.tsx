import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useParams } from 'react-router'
import WorkCentreFormPage from './WorkCentreFormPage'
import * as workCentresApi from './api'
import * as processesApi from '../processes/api'
import * as toolingApi from '../tooling/api'
import * as itemsApi from '../items/api'
import type { WorkCentre, WorkCentreTypeListResponse } from './types'
import type { Process, ProcessListResponse } from '../processes/types'
import type { WorkCentrePosition } from '../tooling/types'

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return { ...actual, useParams: vi.fn() }
})
vi.mock('./api')
vi.mock('../processes/api')
vi.mock('../tooling/api')
vi.mock('../items/api')

const mockedApi = vi.mocked(workCentresApi)
const mockedProcessesApi = vi.mocked(processesApi)
const mockedToolingApi = vi.mocked(toolingApi)
const mockedItemsApi = vi.mocked(itemsApi)
const mockedUseParams = vi.mocked(useParams)

const pressing: Process = {
  id: 5,
  name: 'Pressing',
  code: 'PRESS',
  is_active: true,
  version_id: 50,
  version_number: 1,
  version_status: 'DRAFT',
  category: 1,
  category_name: 'Production',
  work_centre_requirement: 'MACHINE',
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
  description: '',
  inputs: [],
  outputs: [],
  parameters: [],
}

const workCentreTypes: WorkCentreTypeListResponse = {
  count: 1,
  next: null,
  previous: null,
  results: [{ id: 1, name: 'Machine', is_active: true }],
}

beforeEach(() => {
  mockedUseParams.mockReturnValue({})
  const processResponse: ProcessListResponse = {
    count: 1,
    next: null,
    previous: null,
    results: [pressing],
  }
  mockedProcessesApi.listProcesses.mockResolvedValue(processResponse)
  mockedApi.listWorkCentreTypes.mockResolvedValue(workCentreTypes)
  mockedItemsApi.listItems.mockResolvedValue({ count: 0, next: null, previous: null, results: [] })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('WorkCentreFormPage — create', () => {
  it('submits a new work centre and reveals the capabilities section', async () => {
    const created: WorkCentre = {
      id: 10,
      code: 'WC-NEW',
      name: 'Press 01',
      type: 1,
      type_name: 'Machine',
      is_active: true,
      capabilities: [],
      capabilities_count: 0,
      positions: [],
      positions_count: 0,
    }
    mockedApi.createWorkCentre.mockResolvedValue(created)

    render(
      <MemoryRouter>
        <WorkCentreFormPage />
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'WC-NEW' } })
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Press 01' } })
    fireEvent.mouseDown(screen.getByLabelText('Type'))
    const typeOptions = await screen.findAllByText('Machine')
    fireEvent.click(typeOptions[typeOptions.length - 1])
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(mockedApi.createWorkCentre).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'WC-NEW', name: 'Press 01', type: 1 }),
      ),
    )
    expect(await screen.findByText('Capable Processes')).toBeInTheDocument()
    expect(screen.getByText('No processes mapped yet.')).toBeInTheDocument()
  })
})

describe('WorkCentreFormPage — edit', () => {
  const existing: WorkCentre = {
    id: 7,
    code: 'WC-7',
    name: 'Press 02',
    type: 1,
    type_name: 'Machine',
    is_active: true,
    capabilities: [
      {
        id: 100,
        process_definition: 5,
        process_name: 'Pressing',
        process_code: 'PRESS',
        standard_rate: 120,
      },
    ],
    capabilities_count: 1,
    positions: [],
    positions_count: 0,
  }

  beforeEach(() => {
    mockedUseParams.mockReturnValue({ id: '7' })
    mockedApi.getWorkCentre.mockResolvedValue(existing)
    mockedApi.updateWorkCentre.mockResolvedValue(existing)
  })

  it('loads the existing work centre with Code locked and shows its capabilities', async () => {
    render(
      <MemoryRouter>
        <WorkCentreFormPage />
      </MemoryRouter>,
    )

    expect(await screen.findByDisplayValue('Press 02')).toBeInTheDocument()
    expect(screen.getByLabelText('Code')).toHaveValue('WC-7')
    expect(screen.getByLabelText('Code')).toBeDisabled()
    expect(screen.getByText('Pressing (PRESS)')).toBeInTheDocument()
    expect(screen.getByText('Standard Rate: 120')).toBeInTheDocument()
  })

  it('adds a capability and saves the whole list', async () => {
    mockedApi.saveWorkCentreCapabilities.mockResolvedValue({
      ...existing,
      capabilities: [
        ...existing.capabilities,
        { id: 101, process_definition: 5, process_name: 'Pressing', process_code: 'PRESS', standard_rate: null },
      ],
      capabilities_count: 2,
    })

    render(
      <MemoryRouter>
        <WorkCentreFormPage />
      </MemoryRouter>,
    )
    await screen.findByDisplayValue('Press 02')

    fireEvent.click(screen.getByText('+ Add Capability'))
    const dialog = await screen.findByRole('dialog')

    fireEvent.mouseDown(within(dialog).getByLabelText('Process'))
    const options = await screen.findAllByText('Pressing (PRESS)')
    fireEvent.click(options[options.length - 1])

    fireEvent.click(within(dialog).getByRole('button', { name: 'Add' }))

    await waitFor(() =>
      expect(mockedApi.saveWorkCentreCapabilities).toHaveBeenCalledWith(7, {
        capabilities: [
          { id: 100, process_definition: 5, standard_rate: 120 },
          expect.objectContaining({ process_definition: 5 }),
        ],
      }),
    )
  })

  it('removes a capability', async () => {
    mockedApi.saveWorkCentreCapabilities.mockResolvedValue({
      ...existing,
      capabilities: [],
      capabilities_count: 0,
    })

    render(
      <MemoryRouter>
        <WorkCentreFormPage />
      </MemoryRouter>,
    )
    await screen.findByDisplayValue('Press 02')

    fireEvent.click(screen.getByLabelText('Remove Pressing'))

    await waitFor(() =>
      expect(mockedApi.saveWorkCentreCapabilities).toHaveBeenCalledWith(7, { capabilities: [] }),
    )
  })

  it('shows configured positions and adds a new one', async () => {
    const position: WorkCentrePosition = {
      id: 1,
      position_index: 1,
      display_label: '',
      is_active: true,
      installed_tooling: '10" Round Mould',
      installed_tooling_code: 'MLD-101',
      default_sku: '10" Round Plate (PLATE-10)',
      standard_rate: '60',
    }
    const withPosition = { ...existing, positions: [position], positions_count: 1 }
    mockedApi.getWorkCentre.mockResolvedValue(withPosition)
    mockedApi.saveWorkCentrePositions.mockResolvedValue({
      ...withPosition,
      positions: [
        position,
        {
          ...position,
          id: 2,
          position_index: 2,
          installed_tooling: '',
          installed_tooling_code: '',
          default_sku: '',
          standard_rate: '',
        },
      ],
      positions_count: 2,
    })

    render(
      <MemoryRouter>
        <WorkCentreFormPage />
      </MemoryRouter>,
    )
    await screen.findByDisplayValue('Press 02')

    expect(screen.getByText('MLD-101 — 10" Round Mould')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '+ Add Position' }))

    await waitFor(() =>
      expect(mockedApi.saveWorkCentrePositions).toHaveBeenCalledWith(7, {
        positions: [
          { id: 1, display_label: '', is_active: true },
          { display_label: '', is_active: true },
        ],
      }),
    )
  })

  it('opens Change Tooling and confirms a changeover', async () => {
    const position: WorkCentrePosition = {
      id: 1,
      position_index: 1,
      display_label: '',
      is_active: true,
      installed_tooling: '',
      installed_tooling_code: '',
      default_sku: '',
      standard_rate: '',
    }
    const withPosition = { ...existing, positions: [position], positions_count: 1 }
    mockedApi.getWorkCentre.mockResolvedValue(withPosition)
    mockedToolingApi.listTooling.mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          id: 9,
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
        },
      ],
    })
    mockedToolingApi.createToolingAssignment.mockResolvedValue({
      id: 1,
      tooling: 9,
      tooling_name: '10" Round Mould',
      tooling_code: 'MLD-101',
      work_centre_position: 1,
      work_centre_name: 'Press 02',
      position_index: 1,
      default_item: null,
      default_item_label: '',
      standard_rate_override: 60,
      effective_from: '2026-08-20T14:00:00Z',
      effective_to: null,
      notes: '',
    })

    render(
      <MemoryRouter>
        <WorkCentreFormPage />
      </MemoryRouter>,
    )
    await screen.findByDisplayValue('Press 02')

    fireEvent.click(screen.getByRole('button', { name: /Change Tooling/ }))
    const dialog = await screen.findByRole('dialog')

    fireEvent.mouseDown(within(dialog).getByLabelText('New Tooling'))
    const options = await screen.findAllByText('10" Round Mould (MLD-101)')
    fireEvent.click(options[options.length - 1])

    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm Changeover' }))

    await waitFor(() =>
      expect(mockedToolingApi.createToolingAssignment).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ tooling: 9 }),
      ),
    )
  })
})
