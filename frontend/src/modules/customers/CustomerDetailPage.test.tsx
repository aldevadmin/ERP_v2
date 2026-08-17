import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import CustomerDetailPage from './CustomerDetailPage'
import * as customersApi from './api'
import type { Customer } from './types'

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return { ...actual, useParams: () => ({ id: '3' }), useNavigate: () => vi.fn() }
})
vi.mock('./api')

const mockedApi = vi.mocked(customersApi)

afterEach(() => {
  vi.clearAllMocks()
})

describe('CustomerDetailPage', () => {
  it('renders customer details and addresses', async () => {
    const customer: Customer = {
      id: 3,
      code: 'C3',
      name: 'Acme',
      main_poc: 'Jane Doe',
      emails: ['ops@acme.com'],
      phone_numbers: ['+1-555-1000'],
      internal_coordinator: 1,
      internal_coordinator_detail: { id: 1, employee_code: 'EMP1', full_name: 'Asha Rao', team: null },
      is_active: true,
      addresses: [
        {
          id: 1,
          address_type: 'BILLING',
          line1: '1 Main St',
          line2: '',
          line3: '',
          state: '',
          pin: '12345',
          country: 'USA',
        },
      ],
    }
    mockedApi.getCustomer.mockResolvedValue(customer)

    render(
      <MemoryRouter>
        <CustomerDetailPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Acme')).toBeInTheDocument()
    expect(screen.getByText('C3')).toBeInTheDocument()
    expect(screen.getByText('Billing')).toBeInTheDocument()
    expect(screen.getByText('1 Main St')).toBeInTheDocument()
    expect(screen.getByText('Asha Rao')).toBeInTheDocument()
  })

  it('shows a not-found state when the customer fails to load', async () => {
    mockedApi.getCustomer.mockRejectedValue(new Error('not found'))

    render(
      <MemoryRouter>
        <CustomerDetailPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Customer not found')).toBeInTheDocument()
  })
})
