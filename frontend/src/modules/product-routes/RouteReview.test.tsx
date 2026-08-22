import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import RouteReview from './RouteReview'
import * as api from './api'
import type { ProcessRoute } from './types'

vi.mock('./api')

const mockedApi = vi.mocked(api)

afterEach(() => {
  vi.clearAllMocks()
})

const draftRoute: ProcessRoute = {
  id: 1,
  name: 'Standard Plate Production',
  is_active: true,
  version_id: 10,
  version_number: 1,
  version_status: 'DRAFT',
  is_default: true,
  effective_from: null,
  effective_to: null,
  product: 1,
  product_name: '10" Round Areca Plate',
  nodes: [
    {
      id: 1,
      node_key: 'washing',
      process_definition: 10,
      process_definition_name: 'Washing',
      display_label: '',
      sequence_hint: 1,
      is_optional: false,
      outputs: [],
    },
    {
      id: 2,
      node_key: 'pressing',
      process_definition: 11,
      process_definition_name: 'Pressing',
      display_label: '',
      sequence_hint: 2,
      is_optional: false,
      outputs: [],
    },
  ],
  edges: [
    {
      id: 1,
      source_node: 1,
      source_output_definition: null,
      target_node: 2,
      disposition_type: 'CONTINUE_TO_PROCESS',
      destination_location: null,
      destination_location_name: '',
    },
  ],
}

describe('RouteReview', () => {
  it('renders the flow and route metadata', () => {
    render(<RouteReview route={draftRoute} onActivated={vi.fn()} onEditStep={vi.fn()} />)

    expect(
      screen.getByText('Review "Standard Plate Production" before activating'),
    ).toBeInTheDocument()
    expect(screen.getByText('Washing → Pressing')).toBeInTheDocument()
    expect(screen.getByText('Product: 10" Round Areca Plate')).toBeInTheDocument()
  })

  it('activates the route and reports the new status', async () => {
    const onActivated = vi.fn()
    mockedApi.activateRouteVersion.mockResolvedValue({ version_status: 'ACTIVE' })

    render(<RouteReview route={draftRoute} onActivated={onActivated} onEditStep={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Activate Route' }))

    await waitFor(() => expect(mockedApi.activateRouteVersion).toHaveBeenCalledWith(10))
    await waitFor(() => expect(onActivated).toHaveBeenCalledWith('ACTIVE'))
  })

  it('calls onEditStep when Edit Steps is clicked', () => {
    const onEditStep = vi.fn()

    render(<RouteReview route={draftRoute} onActivated={vi.fn()} onEditStep={onEditStep} />)

    fireEvent.click(screen.getByRole('button', { name: '← Edit Steps' }))

    expect(onEditStep).toHaveBeenCalledWith('steps')
  })
})
