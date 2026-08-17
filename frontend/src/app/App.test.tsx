import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import App from './App'
import * as authApi from '../modules/auth/api'
import type { CurrentUser } from '../modules/auth/types'

vi.mock('../modules/auth/api')

const mockedAuthApi = vi.mocked(authApi)

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

const currentUser: CurrentUser = {
  id: 1,
  username: 'operator1',
  roles: ['Export Coordinator'],
  employee: {
    employee_code: 'EMP001',
    full_name: 'Operator One',
    designation: 'Coordinator',
    team: null,
    organization: { id: 1, name: 'Default Organization' },
  },
}

function stubHealthFetchPending() {
  // HealthStatus (rendered once authenticated) makes its own real fetch call —
  // keep it pending so it doesn't affect these auth-focused assertions.
  vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
}

describe('App', () => {
  it('shows the login page when there is no session', async () => {
    mockedAuthApi.getCsrf.mockResolvedValue(undefined)
    mockedAuthApi.getMe.mockRejectedValue(new Error('not authenticated'))

    render(<App />)

    // "Sign in" also appears as the submit button's label — scope to the heading.
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('shows the authenticated shell after a successful login', async () => {
    mockedAuthApi.getCsrf.mockResolvedValue(undefined)
    mockedAuthApi.getMe.mockRejectedValue(new Error('not authenticated'))
    mockedAuthApi.login.mockResolvedValue(currentUser)
    stubHealthFetchPending()

    render(<App />)
    await screen.findByRole('heading', { name: 'Sign in' })

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'operator1' } })
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'a-strong-password' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('Operator One')).toBeInTheDocument()
    expect(screen.getByText('Export Coordinator')).toBeInTheDocument()
  })

  it('returns to the login page after logout', async () => {
    mockedAuthApi.getCsrf.mockResolvedValue(undefined)
    mockedAuthApi.getMe.mockResolvedValue(currentUser)
    mockedAuthApi.logout.mockResolvedValue(undefined)
    stubHealthFetchPending()

    render(<App />)
    await screen.findByText('Operator One')

    fireEvent.click(screen.getByText('Operator One'))
    fireEvent.click(await screen.findByText('Log out'))

    // "Sign in" also appears as the submit button's label — scope to the heading.
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })
})
