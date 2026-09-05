import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import WorkCentreListPage from './WorkCentreListPage'
import * as workCentresApi from './api'
import type { WorkCentreListResponse, WorkCentreTypeListResponse } from './types'

vi.mock('./api')

const mockedApi = vi.mocked(workCentresApi)

afterEach(() => {
  vi.clearAllMocks()
})

const response: WorkCentreListResponse = {
  count: 1,
  next: null,
  previous: null,
  results: [
    {
      id: 1,
      code: 'WC-1',
      name: 'Press 01',
      type: 1,
      type_name: 'Machine',
      bay: null,
      bay_name: null,
      is_active: true,
      capabilities: [],
      capabilities_count: 2,
      positions: [],
      positions_count: 0,
    },
  ],
}

const workCentreTypes: WorkCentreTypeListResponse = {
  count: 1,
  next: null,
  previous: null,
  results: [{ id: 1, name: 'Machine', is_active: true }],
}

describe('WorkCentreListPage', () => {
  it('renders work centres from the API', async () => {
    mockedApi.listWorkCentres.mockResolvedValue(response)
    mockedApi.listWorkCentreTypes.mockResolvedValue(workCentreTypes)

    render(
      <MemoryRouter>
        <WorkCentreListPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Press 01')).toBeInTheDocument()
    expect(screen.getByText('WC-1')).toBeInTheDocument()
    expect(screen.getByText('Machine')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(mockedApi.listWorkCentres).toHaveBeenCalledWith({
      search: undefined,
      isActive: true,
      type: undefined,
    })
  })

  it('requests every work centre once "Active only" is turned off', async () => {
    mockedApi.listWorkCentres.mockResolvedValue(response)
    mockedApi.listWorkCentreTypes.mockResolvedValue(workCentreTypes)

    render(
      <MemoryRouter>
        <WorkCentreListPage />
      </MemoryRouter>,
    )
    await screen.findByText('Press 01')

    fireEvent.click(screen.getByRole('switch'))

    await waitFor(() =>
      expect(mockedApi.listWorkCentres).toHaveBeenLastCalledWith({
        search: undefined,
        isActive: undefined,
        type: undefined,
      }),
    )
  })

  it('filters by type', async () => {
    mockedApi.listWorkCentres.mockResolvedValue(response)
    mockedApi.listWorkCentreTypes.mockResolvedValue(workCentreTypes)

    render(
      <MemoryRouter>
        <WorkCentreListPage />
      </MemoryRouter>,
    )
    await screen.findByText('Press 01')

    fireEvent.mouseDown(screen.getByLabelText('Type'))
    const options = await screen.findAllByText('Machine')
    fireEvent.click(options[options.length - 1])

    await waitFor(() =>
      expect(mockedApi.listWorkCentres).toHaveBeenLastCalledWith({
        search: undefined,
        isActive: true,
        type: 1,
      }),
    )
  })

  it('deletes a work centre after confirmation', async () => {
    mockedApi.listWorkCentres.mockResolvedValue(response)
    mockedApi.listWorkCentreTypes.mockResolvedValue(workCentreTypes)
    mockedApi.deleteWorkCentre.mockResolvedValue(undefined)

    render(
      <MemoryRouter>
        <WorkCentreListPage />
      </MemoryRouter>,
    )
    await screen.findByText('Press 01')

    fireEvent.click(screen.getByLabelText('Delete Press 01'))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(mockedApi.deleteWorkCentre).toHaveBeenCalledWith(1))
  })
})
