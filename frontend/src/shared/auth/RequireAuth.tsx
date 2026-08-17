import type { ReactNode } from 'react'
import { Flex, Spin } from 'antd'
import LoginPage from '../../modules/auth/LoginPage'
import { useAuth } from './AuthContext'

/**
 * Gates its children on an authenticated session. There's no router yet
 * (a single-screen foundation), so this is a conditional render rather
 * than a URL redirect — every future module's routes reuse this the same
 * way once routing exists.
 */
export default function RequireAuth({ children }: { children: ReactNode }) {
  const { state } = useAuth()

  if (state.status === 'loading') {
    return (
      <Flex align="center" justify="center" style={{ minHeight: '100vh' }}>
        <Spin size="large" />
      </Flex>
    )
  }

  if (state.status === 'anonymous') {
    return <LoginPage />
  }

  return <>{children}</>
}
