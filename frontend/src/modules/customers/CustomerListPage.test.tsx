import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import CustomerListPage from './CustomerListPage'
import * as customersApi from './api'
import type { CustomerListResponse } from './types'

vi.mock('./api')

const mockedApi = vi.mocked(customersApi)

afterEach(() => {
  vi.clearAllMocks()
})

const response: CustomerListResponse = {
  count: 1,
  next: null,
  previous: null,
  results: [
    {
      id: 1,
      code: 'C1',
      name: 'Acme',
      main_poc: 'Jane Doe',
      internal_coordinator: null,
      internal_coordinator_detail: null,
      is_active: true,
    },
  ],
}

describe('CustomerListPage', () => {
  it('renders customers from the API', async () => {
    mockedApi.listCustomers.mockResolvedValue(response)

    render(
      <MemoryRouter>
        <CustomerListPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Acme')).toBeInTheDocument()
    expect(screen.getByText('C1')).toBeInTheDocument()
    expect(mockedApi.listCustomers).toHaveBeenCalledWith({ search: undefined, isActive: true })
  })

  it('requests every customer once "Active only" is turned off', async () => {
    mockedApi.listCustomers.mockResolvedValue(response)

    render(
      <MemoryRouter>
        <CustomerListPage />
      </MemoryRouter>,
    )
    await screen.findByText('Acme')

    fireEvent.click(screen.getByRole('switch'))

    await waitFor(() =>
      expect(mockedApi.listCustomers).toHaveBeenLastCalledWith({
        search: undefined,
        isActive: undefined,
      }),
    )
  })
})
