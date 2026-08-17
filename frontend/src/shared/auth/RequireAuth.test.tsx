import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import RequireAuth from './RequireAuth'
import { useAuth } from './AuthContext'

vi.mock('./AuthContext', () => ({
  useAuth: vi.fn(),
}))
vi.mock('../../modules/auth/LoginPage', () => ({
  default: () => <div>Login Page Stub</div>,
}))

const mockedUseAuth = vi.mocked(useAuth)

afterEach(() => {
  vi.clearAllMocks()
})

describe('RequireAuth', () => {
  it('shows a loading indicator while the session is being checked', () => {
    mockedUseAuth.mockReturnValue({
      state: { user: null, status: 'loading' },
      login: vi.fn(),
      logout: vi.fn(),
    })

    render(
      <RequireAuth>
        <div>Protected content</div>
      </RequireAuth>,
    )

    expect(screen.queryByText('Protected content')).not.toBeInTheDocument()
    expect(screen.queryByText('Login Page Stub')).not.toBeInTheDocument()
  })

  it('shows the login page when there is no session', () => {
    mockedUseAuth.mockReturnValue({
      state: { user: null, status: 'anonymous' },
      login: vi.fn(),
      logout: vi.fn(),
    })

    render(
      <RequireAuth>
        <div>Protected content</div>
      </RequireAuth>,
    )

    expect(screen.getByText('Login Page Stub')).toBeInTheDocument()
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument()
  })

  it('renders its children once authenticated', () => {
    mockedUseAuth.mockReturnValue({
      state: {
        user: { id: 1, username: 'operator1', roles: [], employee: null },
        status: 'authenticated',
      },
      login: vi.fn(),
      logout: vi.fn(),
    })

    render(
      <RequireAuth>
        <div>Protected content</div>
      </RequireAuth>,
    )

    expect(screen.getByText('Protected content')).toBeInTheDocument()
  })
})
