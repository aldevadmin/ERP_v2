import { useEffect, useState } from 'react'
import { Card, Space, Tag, Typography } from 'antd'
import { fetchHealth, type HealthResponse } from '../shared/api/client'

const { Title, Text } = Typography

type ConnectionState =
  | { status: 'checking' }
  | { status: 'connected'; health: HealthResponse }
  | { status: 'unreachable'; message: string }

function useBackendHealth(): ConnectionState {
  const [state, setState] = useState<ConnectionState>({ status: 'checking' })

  useEffect(() => {
    let cancelled = false

    fetchHealth()
      .then((health) => {
        if (!cancelled) setState({ status: 'connected', health })
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : 'Unknown error'
          setState({ status: 'unreachable', message })
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  return state
}

function BackendStatusTag({ state }: { state: ConnectionState }) {
  if (state.status === 'checking') {
    return <Tag>Checking…</Tag>
  }
  if (state.status === 'connected') {
    return <Tag color="success">Connected</Tag>
  }
  return <Tag color="error">Unreachable</Tag>
}

export default function HealthStatus() {
  const backend = useBackendHealth()

  return (
    <Card style={{ maxWidth: 480, width: '100%' }}>
      <Space orientation="vertical" size="large" style={{ width: '100%' }}>
        <div>
          <Title level={3} style={{ marginBottom: 0 }}>
            ERP Platform
          </Title>
          <Text type="secondary">Foundation build — no business modules yet</Text>
        </div>

        <Space orientation="vertical" size="small" style={{ width: '100%' }}>
          <Space>
            <Text strong>Frontend</Text>
            <Tag color="success">Running</Tag>
          </Space>
          <Space>
            <Text strong>Backend</Text>
            <BackendStatusTag state={backend} />
          </Space>
          {backend.status === 'connected' && (
            <Text type="secondary">
              {backend.health.service} · database {backend.health.database}
            </Text>
          )}
          {backend.status === 'unreachable' && <Text type="danger">{backend.message}</Text>}
        </Space>
      </Space>
    </Card>
  )
}
