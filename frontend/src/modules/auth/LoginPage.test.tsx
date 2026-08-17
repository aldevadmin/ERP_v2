import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import LoginPage from './LoginPage'
import { useAuth } from '../../shared/auth/AuthContext'

vi.mock('../../shared/auth/AuthContext', () => ({
  useAuth: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)

afterEach(() => {
  vi.clearAllMocks()
})

describe('LoginPage', () => {
  it('submits the entered username and password', async () => {
    const login = vi.fn().mockResolvedValue(undefined)
    mockedUseAuth.mockReturnValue({
      login,
      logout: vi.fn(),
      state: { user: null, status: 'anonymous' },
    })

    render(<LoginPage />)

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'operator1' } })
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'a-strong-password' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => expect(login).toHaveBeenCalledWith('operator1', 'a-strong-password'))
  })

  it('shows an error message when login fails', async () => {
    const login = vi.fn().mockRejectedValue(new Error('Invalid credentials.'))
    mockedUseAuth.mockReturnValue({
      login,
      logout: vi.fn(),
      state: { user: null, status: 'anonymous' },
    })

    render(<LoginPage />)

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'operator1' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('Invalid credentials.')).toBeInTheDocument()
  })
})
