import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import VendorListPage from './VendorListPage'
import * as vendorsApi from './api'
import type { VendorListResponse } from './types'

vi.mock('./api')

const mockedApi = vi.mocked(vendorsApi)

afterEach(() => {
  vi.clearAllMocks()
})

const response: VendorListResponse = {
  count: 1,
  next: null,
  previous: null,
  results: [{ id: 1, code: 'V1', name: 'Acme Vendor', category: 'Packaging', is_active: true }],
}

describe('VendorListPage', () => {
  it('renders vendors from the API', async () => {
    mockedApi.listVendors.mockResolvedValue(response)

    render(<VendorListPage />)

    expect(await screen.findByText('Acme Vendor')).toBeInTheDocument()
    expect(screen.getByText('V1')).toBeInTheDocument()
    expect(screen.getByText('Packaging')).toBeInTheDocument()
    expect(mockedApi.listVendors).toHaveBeenCalledWith({ search: undefined })
  })

  it('searches by code or name', async () => {
    mockedApi.listVendors.mockResolvedValue(response)

    render(<VendorListPage />)
    await screen.findByText('Acme Vendor')

    fireEvent.change(screen.getByPlaceholderText('Search by code or name'), {
      target: { value: 'Acme' },
    })
    fireEvent.keyDown(screen.getByPlaceholderText('Search by code or name'), {
      key: 'Enter',
      code: 'Enter',
    })

    await waitFor(() => expect(mockedApi.listVendors).toHaveBeenLastCalledWith({ search: 'Acme' }))
  })
})
