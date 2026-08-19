import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useNavigate, useParams } from 'react-router'
import ProcessCategoryFormPage from './ProcessCategoryFormPage'
import * as processesApi from './api'
import type { ProcessCategory } from './types'

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return { ...actual, useNavigate: vi.fn(), useParams: vi.fn() }
})
vi.mock('./api')

const mockedApi = vi.mocked(processesApi)
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

describe('ProcessCategoryFormPage — create', () => {
  it('submits a new category', async () => {
    const created: ProcessCategory = { id: 10, name: 'Movement', is_active: true }
    mockedApi.createProcessCategory.mockResolvedValue(created)

    render(
      <MemoryRouter>
        <ProcessCategoryFormPage />
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Movement' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(mockedApi.createProcessCategory).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Movement' }),
      ),
    )
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/process-categories'))
  })
})

describe('ProcessCategoryFormPage — edit', () => {
  it('loads the existing category and submits an update', async () => {
    mockedUseParams.mockReturnValue({ id: '5' })
    const existing: ProcessCategory = { id: 5, name: 'Quality', is_active: true }
    mockedApi.getProcessCategory.mockResolvedValue(existing)
    mockedApi.updateProcessCategory.mockResolvedValue(existing)

    render(
      <MemoryRouter>
        <ProcessCategoryFormPage />
      </MemoryRouter>,
    )

    expect(await screen.findByDisplayValue('Quality')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(mockedApi.updateProcessCategory).toHaveBeenCalledWith(5, expect.any(Object)),
    )
  })
})
