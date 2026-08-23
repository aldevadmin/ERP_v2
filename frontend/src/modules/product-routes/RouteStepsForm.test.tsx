import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import RouteStepsForm from './RouteStepsForm'
import * as productRoutesApi from './api'
import * as processesApi from '../processes/api'
import type { ProcessListResponse } from '../processes/types'
import type { ProcessRouteVersion, RouteNode } from './types'

vi.mock('./api')
vi.mock('../processes/api')

const mockedApi = vi.mocked(productRoutesApi)
const mockedProcessesApi = vi.mocked(processesApi)

afterEach(() => {
  vi.clearAllMocks()
})

const washing: RouteNode = {
  id: 1,
  node_key: 'washing',
  process_definition: 10,
  process_definition_name: 'Washing',
  display_label: '',
  sequence_hint: 1,
  is_optional: false,
  outputs: [],
}

const pressing: RouteNode = {
  id: 2,
  node_key: 'pressing',
  process_definition: 11,
  process_definition_name: 'Pressing',
  display_label: '',
  sequence_hint: 2,
  is_optional: false,
  outputs: [],
}

const processesResponse: ProcessListResponse = {
  count: 1,
  next: null,
  previous: null,
  results: [
    {
      id: 11,
      name: 'Pressing',
      code: 'PRESS',
      is_active: true,
      version_id: 100,
      version_number: 1,
      version_status: 'ACTIVE',
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
    },
  ],
}

function emptyVersion(): ProcessRouteVersion {
  return {
    id: 1,
    version_number: 1,
    status: 'DRAFT',
    is_default: false,
    effective_from: null,
    effective_to: null,
    item: 1,
    item_name: '10" Round Areca Plate',
    route_name: 'Standard',
    nodes: [washing],
    edges: [],
  }
}

describe('RouteStepsForm', () => {
  it('shows the header question and existing steps', () => {
    render(
      <RouteStepsForm
        productName='10" Round Areca Plate'
        versionId={1}
        nodes={[washing, pressing]}
        onSaved={vi.fn()}
        onContinue={vi.fn()}
      />,
    )

    expect(
      screen.getByText('How is "10" Round Areca Plate" processed?'),
    ).toBeInTheDocument()
    expect(screen.getByText('1 Washing')).toBeInTheDocument()
    expect(screen.getByText('2 Pressing')).toBeInTheDocument()
  })

  it('adds a step and saves the whole list', async () => {
    mockedProcessesApi.listProcesses.mockResolvedValue(processesResponse)
    const onSaved = vi.fn()
    mockedApi.saveRouteNodes.mockResolvedValue(emptyVersion())

    render(
      <RouteStepsForm
        productName='10" Round Areca Plate'
        versionId={1}
        nodes={[washing]}
        onSaved={onSaved}
        onContinue={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByText('+ Add Step'))
    const dialog = await screen.findByRole('dialog')

    fireEvent.mouseDown(within(dialog).getByLabelText('Process'))
    const options = await screen.findAllByText('Pressing (PRESS)')
    fireEvent.click(options[options.length - 1])

    fireEvent.click(within(dialog).getByRole('button', { name: 'Add Step' }))

    await waitFor(() =>
      expect(mockedApi.saveRouteNodes).toHaveBeenCalledWith(1, {
        nodes: [
          expect.objectContaining({ id: 1, process_definition: 10 }),
          expect.objectContaining({ process_definition: 11 }),
        ],
      }),
    )
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
  })

  it('deletes a step', async () => {
    mockedApi.saveRouteNodes.mockResolvedValue(emptyVersion())

    render(
      <RouteStepsForm
        productName='10" Round Areca Plate'
        versionId={1}
        nodes={[washing, pressing]}
        onSaved={vi.fn()}
        onContinue={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByLabelText('Delete Washing'))

    await waitFor(() =>
      expect(mockedApi.saveRouteNodes).toHaveBeenCalledWith(1, {
        nodes: [expect.objectContaining({ id: 2 })],
      }),
    )
  })

  it('moves a step down', async () => {
    mockedApi.saveRouteNodes.mockResolvedValue(emptyVersion())

    render(
      <RouteStepsForm
        productName='10" Round Areca Plate'
        versionId={1}
        nodes={[washing, pressing]}
        onSaved={vi.fn()}
        onContinue={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByLabelText('Move Washing down'))

    await waitFor(() =>
      expect(mockedApi.saveRouteNodes).toHaveBeenCalledWith(1, {
        nodes: [expect.objectContaining({ id: 2 }), expect.objectContaining({ id: 1 })],
      }),
    )
  })

  it('calls onContinue when Save & Continue is clicked', () => {
    const onContinue = vi.fn()

    render(
      <RouteStepsForm
        productName='10" Round Areca Plate'
        versionId={1}
        nodes={[washing]}
        onSaved={vi.fn()}
        onContinue={onContinue}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Save & Continue →' }))

    expect(onContinue).toHaveBeenCalled()
  })
})
