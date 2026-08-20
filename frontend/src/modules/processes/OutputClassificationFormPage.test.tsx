import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useNavigate, useParams } from 'react-router'
import OutputClassificationFormPage from './OutputClassificationFormPage'
import * as processesApi from './api'
import type { OutputClassification } from './types'

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

describe('OutputClassificationFormPage — create', () => {
  it('submits a new classification', async () => {
    const created: OutputClassification = { id: 10, name: 'Deluxe', is_active: true }
    mockedApi.createOutputClassification.mockResolvedValue(created)

    render(
      <MemoryRouter>
        <OutputClassificationFormPage />
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Deluxe' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(mockedApi.createOutputClassification).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Deluxe' }),
      ),
    )
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/output-classifications'))
  })
})

describe('OutputClassificationFormPage — edit', () => {
  it('loads the existing classification and submits an update', async () => {
    mockedUseParams.mockReturnValue({ id: '5' })
    const existing: OutputClassification = { id: 5, name: 'Reject', is_active: true }
    mockedApi.getOutputClassification.mockResolvedValue(existing)
    mockedApi.updateOutputClassification.mockResolvedValue(existing)

    render(
      <MemoryRouter>
        <OutputClassificationFormPage />
      </MemoryRouter>,
    )

    expect(await screen.findByDisplayValue('Reject')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(mockedApi.updateOutputClassification).toHaveBeenCalledWith(5, expect.any(Object)),
    )
  })
})
