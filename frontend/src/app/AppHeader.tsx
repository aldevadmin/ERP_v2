import { Layout } from 'antd'
import { BellOutlined } from '@ant-design/icons'
import { useAuth } from '../shared/auth/AuthContext'

const { Header } = Layout

export default function AppHeader() {
  const { state } = useAuth()
  if (!state.user) return null

  return (
    <Header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        background: '#fff',
        borderBottom: '1px solid #f0f0f0',
        padding: '0 24px',
      }}
    >
      {/* No unread count shown — there's no notifications feature/data behind this yet. */}
      <BellOutlined aria-label="Notifications" style={{ fontSize: 18, color: '#667085' }} />
    </Header>
  )
}
