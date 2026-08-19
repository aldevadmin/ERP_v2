import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useNavigate, useParams } from 'react-router'
import MaterialFormPage from './MaterialFormPage'
import * as materialsApi from './api'
import type { Material } from './types'

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return { ...actual, useNavigate: vi.fn(), useParams: vi.fn() }
})
vi.mock('./api')

const mockedApi = vi.mocked(materialsApi)
const mockedUseNavigate = vi.mocked(useNavigate)
const mockedUseParams = vi.mocked(useParams)
const navigateMock = vi.fn()

beforeEach(() => {
  mockedUseNavigate.mockReturnValue(navigateMock)
  mockedUseParams.mockReturnValue({})
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('MaterialFormPage — create', () => {
  it('submits a new material', async () => {
    const created: Material = { id: 10, code: 'NEW1', name: 'New Material', unit: 'Kg', is_active: true }
    mockedApi.createMaterial.mockResolvedValue(created)

    render(
      <MemoryRouter>
        <MaterialFormPage />
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'NEW1' } })
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New Material' } })
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: 'Kg' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(mockedApi.createMaterial).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'NEW1', name: 'New Material', unit: 'Kg' }),
      ),
    )
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/materials'))
  })
})

describe('MaterialFormPage — edit', () => {
  it('loads the existing material and submits an update', async () => {
    mockedUseParams.mockReturnValue({ id: '5' })
    const existing: Material = {
      id: 5,
      code: 'EXIST',
      name: 'Existing Material',
      unit: 'Kg',
      is_active: true,
    }
    mockedApi.getMaterial.mockResolvedValue(existing)
    mockedApi.updateMaterial.mockResolvedValue(existing)

    render(
      <MemoryRouter>
        <MaterialFormPage />
      </MemoryRouter>,
    )

    expect(await screen.findByDisplayValue('Existing Material')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(mockedApi.updateMaterial).toHaveBeenCalledWith(5, expect.any(Object)),
    )
  })
})
