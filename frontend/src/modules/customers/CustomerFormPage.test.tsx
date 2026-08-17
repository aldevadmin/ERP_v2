import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useNavigate, useParams } from 'react-router'
import CustomerFormPage from './CustomerFormPage'
import * as customersApi from './api'
import * as accountsApi from '../accounts/api'
import type { Customer } from './types'

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return { ...actual, useNavigate: vi.fn(), useParams: vi.fn() }
})
vi.mock('./api')
vi.mock('../accounts/api')

const mockedApi = vi.mocked(customersApi)
const mockedAccountsApi = vi.mocked(accountsApi)
const mockedUseNavigate = vi.mocked(useNavigate)
const mockedUseParams = vi.mocked(useParams)
const navigateMock = vi.fn()

beforeEach(() => {
  mockedUseNavigate.mockReturnValue(navigateMock)
  mockedUseParams.mockReturnValue({})
  mockedAccountsApi.listEmployees.mockResolvedValue({
    count: 0,
    next: null,
    previous: null,
    results: [],
  })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('CustomerFormPage — create', () => {
  it('submits a new customer with no addresses', async () => {
    const created: Customer = {
      id: 10,
      code: 'NEW1',
      name: 'New Co',
      main_poc: '',
      emails: [],
      phone_numbers: [],
      internal_coordinator: null,
      internal_coordinator_detail: null,
      is_active: true,
      addresses: [],
    }
    mockedApi.createCustomer.mockResolvedValue(created)

    render(
      <MemoryRouter>
        <CustomerFormPage />
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByLabelText('Customer Code'), { target: { value: 'NEW1' } })
    fireEvent.change(screen.getByLabelText('Customer Name'), { target: { value: 'New Co' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(mockedApi.createCustomer).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'NEW1', name: 'New Co' }),
      ),
    )
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/customers/10'))
  })

  it('includes an added address row in the submitted payload', async () => {
    const created: Customer = {
      id: 11,
      code: 'NEW2',
      name: 'New Co 2',
      main_poc: '',
      emails: [],
      phone_numbers: [],
      internal_coordinator: null,
      internal_coordinator_detail: null,
      is_active: true,
      addresses: [],
    }
    mockedApi.createCustomer.mockResolvedValue(created)

    render(
      <MemoryRouter>
        <CustomerFormPage />
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByLabelText('Customer Code'), { target: { value: 'NEW2' } })
    fireEvent.change(screen.getByLabelText('Customer Name'), { target: { value: 'New Co 2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Address' }))

    // Address Type is a required AntD Select — open it and pick an option.
    // It's the last combobox on the page (Email IDs/Phone/Internal
    // Coordinator are all Selects too, added ahead of it).
    const comboboxes = screen.getAllByRole('combobox')
    fireEvent.mouseDown(comboboxes[comboboxes.length - 1])
    fireEvent.click(await screen.findByText('Billing'))

    fireEvent.change(screen.getByLabelText('Address Line 1'), { target: { value: '1 Main St' } })
    fireEvent.change(screen.getByLabelText('Country'), { target: { value: 'USA' } })
    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '91000' } })

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(mockedApi.createCustomer).toHaveBeenCalledWith(
        expect.objectContaining({
          addresses: [
            expect.objectContaining({
              address_type: 'BILLING',
              line1: '1 Main St',
              country: 'USA',
              pin: '91000',
            }),
          ],
        }),
      ),
    )
  })
})

describe('CustomerFormPage — edit', () => {
  it('loads the existing customer and submits an update', async () => {
    mockedUseParams.mockReturnValue({ id: '5' })
    const existing: Customer = {
      id: 5,
      code: 'EXIST',
      name: 'Existing Co',
      main_poc: 'Jane Doe',
      emails: ['ops@existing.com'],
      phone_numbers: ['+1-555-1000'],
      internal_coordinator: null,
      internal_coordinator_detail: null,
      is_active: true,
      addresses: [],
    }
    mockedApi.getCustomer.mockResolvedValue(existing)
    mockedApi.updateCustomer.mockResolvedValue(existing)

    render(
      <MemoryRouter>
        <CustomerFormPage />
      </MemoryRouter>,
    )

    expect(await screen.findByDisplayValue('Existing Co')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(mockedApi.updateCustomer).toHaveBeenCalledWith(5, expect.any(Object)),
    )
  })
})
