import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useNavigate } from 'react-router'
import ToolingListPage from './ToolingListPage'
import * as api from './api'
import type { Tooling, ToolingListResponse, ToolingTypeListResponse } from './types'

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return { ...actual, useNavigate: vi.fn() }
})
vi.mock('./api')

const mockedApi = vi.mocked(api)
const mockedUseNavigate = vi.mocked(useNavigate)
const navigateMock = vi.fn()

const mould: Tooling = {
  id: 1,
  code: 'MLD-101',
  name: '10" Round Mould',
  tooling_type: 1,
  tooling_type_name: 'Mould',
  cavity_count: 1,
  default_standard_rate: 60,
  is_active: true,
  notes: '',
  compatibilities: [],
  compatibilities_count: 1,
}

const toolingTypes: ToolingTypeListResponse = {
  count: 2,
  next: null,
  previous: null,
  results: [
    { id: 1, name: 'Mould', is_active: true },
    { id: 2, name: 'Die', is_active: true },
  ],
}

beforeEach(() => {
  mockedUseNavigate.mockReturnValue(navigateMock)
  mockedApi.listToolingTypes.mockResolvedValue(toolingTypes)
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('ToolingListPage', () => {
  it('renders tooling from the API', async () => {
    const response: ToolingListResponse = { count: 1, next: null, previous: null, results: [mould] }
    mockedApi.listTooling.mockResolvedValue(response)

    render(
      <MemoryRouter>
        <ToolingListPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('MLD-101')).toBeInTheDocument()
    expect(screen.getByText('10" Round Mould')).toBeInTheDocument()
    expect(screen.getByText('Mould')).toBeInTheDocument()
  })

  it('navigates to the tooling edit page on row click', async () => {
    const response: ToolingListResponse = { count: 1, next: null, previous: null, results: [mould] }
    mockedApi.listTooling.mockResolvedValue(response)

    render(
      <MemoryRouter>
        <ToolingListPage />
      </MemoryRouter>,
    )
    const nameCell = await screen.findByText('MLD-101')

    fireEvent.click(nameCell.closest('tr')!)

    expect(navigateMock).toHaveBeenCalledWith('/tooling/1/edit')
  })

  it('filters by type', async () => {
    mockedApi.listTooling.mockResolvedValue({ count: 0, next: null, previous: null, results: [] })

    render(
      <MemoryRouter>
        <ToolingListPage />
      </MemoryRouter>,
    )
    await waitFor(() => expect(mockedApi.listTooling).toHaveBeenCalled())

    fireEvent.mouseDown(screen.getByLabelText('Type'))
    const options = await screen.findAllByText('Die')
    fireEvent.click(options[options.length - 1])

    await waitFor(() =>
      expect(mockedApi.listTooling).toHaveBeenLastCalledWith({
        search: undefined,
        type: 2,
        isActive: true,
      }),
    )
  })

  it('deletes tooling after confirmation', async () => {
    const response: ToolingListResponse = { count: 1, next: null, previous: null, results: [mould] }
    mockedApi.listTooling.mockResolvedValue(response)
    mockedApi.deleteTooling.mockResolvedValue(undefined)

    render(
      <MemoryRouter>
        <ToolingListPage />
      </MemoryRouter>,
    )
    await screen.findByText('MLD-101')

    fireEvent.click(screen.getByLabelText('Delete 10" Round Mould'))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(mockedApi.deleteTooling).toHaveBeenCalledWith(1))
  })
})
