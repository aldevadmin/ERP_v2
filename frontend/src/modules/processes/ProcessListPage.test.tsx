import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useNavigate } from 'react-router'
import ProcessListPage from './ProcessListPage'
import * as processesApi from './api'
import type { Process, ProcessCategoryListResponse, ProcessListResponse } from './types'

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

const process1: Process = {
  id: 1,
  name: 'Washing',
  category: 1,
  category_name: 'Production',
  resource_type: 'STATION',
  inputs: [10],
  outputs: [11, 12, 13],
  description: '',
  is_active: true,
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
    expect(within(row).getByText('3')).toBeInTheDocument()
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
