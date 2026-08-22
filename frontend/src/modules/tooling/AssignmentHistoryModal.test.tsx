import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import AssignmentHistoryModal from './AssignmentHistoryModal'
import * as api from './api'
import type { ToolingAssignment, WorkCentrePosition } from './types'

vi.mock('./api')

const mockedApi = vi.mocked(api)

afterEach(() => {
  vi.clearAllMocks()
})

const position: WorkCentrePosition = {
  id: 3,
  position_index: 2,
  display_label: '',
  is_active: true,
  installed_tooling: '8" Round Mould',
  installed_tooling_code: 'MLD-205',
  default_sku: '',
  standard_rate: '',
}

const history: ToolingAssignment[] = [
  {
    id: 1,
    tooling: 1,
    tooling_name: '8" Round Mould',
    tooling_code: 'MLD-205',
    work_centre_position: 3,
    work_centre_name: 'Press-01',
    position_index: 2,
    default_item: null,
    default_item_label: '8" Plate',
    standard_rate_override: null,
    effective_from: '2026-08-14T08:00:00Z',
    effective_to: '2026-08-20T14:00:00Z',
    notes: '',
  },
  {
    id: 2,
    tooling: 1,
    tooling_name: '8" Round Mould',
    tooling_code: 'MLD-205',
    work_centre_position: 3,
    work_centre_name: 'Press-02',
    position_index: 1,
    default_item: null,
    default_item_label: '8" Plate',
    standard_rate_override: null,
    effective_from: '2026-08-20T14:00:00Z',
    effective_to: null,
    notes: '',
  },
]

describe('AssignmentHistoryModal', () => {
  it('renders the assignment history for a position', async () => {
    mockedApi.listWorkCentrePositionAssignments.mockResolvedValue(history)

    render(<AssignmentHistoryModal open position={position} onClose={vi.fn()} />)

    expect(await screen.findByText('Press-01')).toBeInTheDocument()
    expect(screen.getByText('Press-02')).toBeInTheDocument()
    expect(screen.getAllByText('Current')).toHaveLength(1)
  })

  it('shows an empty state with no history', async () => {
    mockedApi.listWorkCentrePositionAssignments.mockResolvedValue([])

    render(<AssignmentHistoryModal open position={position} onClose={vi.fn()} />)

    expect(await screen.findByText('No assignments yet.')).toBeInTheDocument()
  })
})
