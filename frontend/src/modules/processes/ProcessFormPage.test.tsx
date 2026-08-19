import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useNavigate, useParams } from 'react-router'
import ProcessFormPage from './ProcessFormPage'
import * as processesApi from './api'
import * as materialsApi from '../materials/api'
import type { Process, ProcessCategoryListResponse } from './types'
import type { MaterialListResponse } from '../materials/types'

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return { ...actual, useNavigate: vi.fn(), useParams: vi.fn() }
})
vi.mock('./api')
vi.mock('../materials/api')

const mockedApi = vi.mocked(processesApi)
const mockedMaterialsApi = vi.mocked(materialsApi)
const mockedUseNavigate = vi.mocked(useNavigate)
const mockedUseParams = vi.mocked(useParams)
const navigateMock = vi.fn()

const categoriesResponse: ProcessCategoryListResponse = {
  count: 1,
  next: null,
  previous: null,
  results: [{ id: 1, name: 'Production', is_active: true }],
}

const materialsResponse: MaterialListResponse = {
  count: 2,
  next: null,
  previous: null,
  results: [
    { id: 10, code: 'LEAF', name: 'Raw Leaf', unit: 'Kg', is_active: true },
    { id: 11, code: 'PLATE', name: 'Pressed Plate', unit: 'Piece', is_active: true },
  ],
}

beforeEach(() => {
  mockedUseNavigate.mockReturnValue(navigateMock)
  mockedUseParams.mockReturnValue({})
  mockedApi.listProcessCategories.mockResolvedValue(categoriesResponse)
  mockedMaterialsApi.listMaterials.mockResolvedValue(materialsResponse)
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('ProcessFormPage — create', () => {
  it('submits a new process with a category, resource, and selected inputs/outputs', async () => {
    const created: Process = {
      id: 20,
      name: 'Pressing',
      category: 1,
      category_name: 'Production',
      resource_type: 'MACHINE',
      inputs: [10],
      outputs: [11],
      description: '',
      is_active: true,
    }
    mockedApi.createProcess.mockResolvedValue(created)

    render(
      <MemoryRouter>
        <ProcessFormPage />
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByLabelText('Process Name'), { target: { value: 'Pressing' } })

    fireEvent.mouseDown(screen.getByLabelText('Category'))
    fireEvent.click(await screen.findByText('Production'))

    fireEvent.mouseDown(screen.getByLabelText('Resource'))
    fireEvent.click(await screen.findByText('Machine'))

    fireEvent.mouseDown(screen.getByLabelText('Inputs'))
    const leafOptions = await screen.findAllByText('Raw Leaf (LEAF)')
    fireEvent.click(leafOptions[leafOptions.length - 1])
    fireEvent.keyDown(screen.getByLabelText('Inputs'), { key: 'Escape', code: 'Escape' })

    fireEvent.mouseDown(screen.getByLabelText('Outputs'))
    const plateOptions = await screen.findAllByText('Pressed Plate (PLATE)')
    fireEvent.click(plateOptions[plateOptions.length - 1])

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(mockedApi.createProcess).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Pressing',
          category: 1,
          resource_type: 'MACHINE',
          inputs: [10],
          outputs: [11],
        }),
      ),
    )
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/processes'))
  })
})

describe('ProcessFormPage — edit', () => {
  it('loads the existing process and submits an update', async () => {
    mockedUseParams.mockReturnValue({ id: '5' })
    const existing: Process = {
      id: 5,
      name: 'Washing',
      category: 1,
      category_name: 'Production',
      resource_type: 'STATION',
      inputs: [10],
      outputs: [],
      description: 'Rinses raw leaf.',
      is_active: true,
    }
    mockedApi.getProcess.mockResolvedValue(existing)
    mockedApi.updateProcess.mockResolvedValue(existing)

    render(
      <MemoryRouter>
        <ProcessFormPage />
      </MemoryRouter>,
    )

    expect(await screen.findByDisplayValue('Washing')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(mockedApi.updateProcess).toHaveBeenCalledWith(5, expect.any(Object)),
    )
  })
})
