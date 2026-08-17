import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import * as authApi from '../../modules/auth/api'
import type { CurrentUser } from '../../modules/auth/types'

type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

interface AuthState {
  user: CurrentUser | null
  status: AuthStatus
}

interface AuthContextValue {
  state: AuthState
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, status: 'loading' })

  useEffect(() => {
    let cancelled = false

    authApi
      .getCsrf()
      .catch(() => undefined) // best-effort — a failed CSRF priming shouldn't block the me check
      .then(() => authApi.getMe())
      .then((user) => {
        if (!cancelled) setState({ user, status: 'authenticated' })
      })
      .catch(() => {
        if (!cancelled) setState({ user: null, status: 'anonymous' })
      })

    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    const user = await authApi.login(username, password)
    setState({ user, status: 'authenticated' })
  }, [])

  const logout = useCallback(async () => {
    await authApi.logout()
    setState({ user: null, status: 'anonymous' })
  }, [])

  return <AuthContext.Provider value={{ state, login, logout }}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
