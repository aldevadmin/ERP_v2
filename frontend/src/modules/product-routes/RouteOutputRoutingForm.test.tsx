import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import RouteOutputRoutingForm from './RouteOutputRoutingForm'
import * as api from './api'
import type { ProcessRouteVersion, RouteNode, StorageLocationListResponse } from './types'

vi.mock('./api')

const mockedApi = vi.mocked(api)

afterEach(() => {
  vi.clearAllMocks()
})

const sorting: RouteNode = {
  id: 1,
  node_key: 'sorting',
  process_definition: 10,
  process_definition_name: 'Sorting',
  display_label: '',
  sequence_hint: 1,
  is_optional: false,
  outputs: [
    { id: 100, item_label: 'Premium Plate', classification: 1, classification_name: 'Premium' },
    { id: 101, item_label: 'Reject Plate', classification: 2, classification_name: 'Reject' },
  ],
}

const packing: RouteNode = {
  id: 2,
  node_key: 'packing',
  process_definition: 11,
  process_definition_name: 'Packing',
  display_label: '',
  sequence_hint: 2,
  is_optional: false,
  outputs: [],
}

const locationsResponse: StorageLocationListResponse = {
  count: 1,
  next: null,
  previous: null,
  results: [{ id: 5, name: 'Reject Store', is_active: true }],
}

function emptyVersion(): ProcessRouteVersion {
  return {
    id: 1,
    version_number: 1,
    status: 'DRAFT',
    is_default: false,
    effective_from: null,
    effective_to: null,
    product: 1,
    product_name: '10" Round Areca Plate',
    route_name: 'Standard',
    nodes: [sorting, packing],
    edges: [],
  }
}

describe('RouteOutputRoutingForm', () => {
  it('shows a section per branching step and a row per output', async () => {
    mockedApi.listStorageLocations.mockResolvedValue(locationsResponse)

    render(
      <RouteOutputRoutingForm
        versionId={1}
        nodes={[sorting, packing]}
        edges={[]}
        onSaved={vi.fn()}
        onContinue={vi.fn()}
      />,
    )

    expect(screen.getByText('SORTING')).toBeInTheDocument()
    expect(screen.getByText(/Premium Plate/)).toBeInTheDocument()
    expect(screen.getByText(/Reject Plate/)).toBeInTheDocument()
  })

  it('configures Continue to Process and Move to Storage dispositions and saves', async () => {
    mockedApi.listStorageLocations.mockResolvedValue(locationsResponse)
    const onSaved = vi.fn()
    const onContinue = vi.fn()
    mockedApi.saveRouteEdges.mockResolvedValue(emptyVersion())

    render(
      <RouteOutputRoutingForm
        versionId={1}
        nodes={[sorting, packing]}
        edges={[]}
        onSaved={onSaved}
        onContinue={onContinue}
      />,
    )
    await screen.findByText('SORTING')

    fireEvent.mouseDown(screen.getByLabelText('Next action for Premium Plate'))
    fireEvent.click(await screen.findByText('Continue to Process'))
    fireEvent.mouseDown(screen.getByLabelText('Next process for Premium Plate'))
    fireEvent.click(await screen.findByText('Packing'))

    fireEvent.mouseDown(screen.getByLabelText('Next action for Reject Plate'))
    const moveOptions = await screen.findAllByText('Move / Store')
    fireEvent.click(moveOptions[moveOptions.length - 1])
    fireEvent.mouseDown(screen.getByLabelText('Destination for Reject Plate'))
    fireEvent.click(await screen.findByText('Reject Store'))

    fireEvent.click(screen.getByRole('button', { name: 'Save & Continue →' }))

    await waitFor(() =>
      expect(mockedApi.saveRouteEdges).toHaveBeenCalledWith(1, {
        edges: [
          expect.objectContaining({
            source_node: 1,
            source_output_definition: 100,
            disposition_type: 'CONTINUE_TO_PROCESS',
            target_node: 2,
          }),
          expect.objectContaining({
            source_node: 1,
            source_output_definition: 101,
            disposition_type: 'MOVE_TO_STORAGE',
            destination_location: 5,
          }),
        ],
      }),
    )
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    await waitFor(() => expect(onContinue).toHaveBeenCalled())
  })

  it('shows nothing to configure when no step branches', () => {
    mockedApi.listStorageLocations.mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      results: [],
    })

    render(
      <RouteOutputRoutingForm
        versionId={1}
        nodes={[packing]}
        edges={[]}
        onSaved={vi.fn()}
        onContinue={vi.fn()}
      />,
    )

    expect(
      screen.getByText('No steps in this route produce more than one output — nothing to configure here.'),
    ).toBeInTheDocument()
  })
})
