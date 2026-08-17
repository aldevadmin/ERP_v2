import { useState } from 'react'
import { Alert, Button, Card, Form, Input, Layout, Space, Typography } from 'antd'
import { useAuth } from '../../shared/auth/AuthContext'

const { Content } = Layout
const { Title, Text } = Typography

interface LoginFormValues {
  username: string
  password: string
}

export default function LoginPage() {
  const { login } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (values: LoginFormValues) => {
    setError(null)
    setSubmitting(true)
    try {
      await login(values.username, values.password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Content
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <Card style={{ maxWidth: 400, width: '100%' }}>
          <Space orientation="vertical" size="large" style={{ width: '100%' }}>
            <div>
              <Title level={3} style={{ marginBottom: 0 }}>
                Sign in
              </Title>
              <Text type="secondary">ERP Platform</Text>
            </div>

            {error && <Alert type="error" title={error} showIcon />}

            <Form<LoginFormValues> layout="vertical" onFinish={handleSubmit} disabled={submitting}>
              <Form.Item
                label="Username"
                name="username"
                rules={[{ required: true, message: 'Enter your username.' }]}
              >
                <Input size="large" autoFocus autoComplete="username" />
              </Form.Item>
              <Form.Item
                label="Password"
                name="password"
                rules={[{ required: true, message: 'Enter your password.' }]}
              >
                <Input.Password size="large" autoComplete="current-password" />
              </Form.Item>
              <Form.Item style={{ marginBottom: 0 }}>
                <Button type="primary" htmlType="submit" size="large" block loading={submitting}>
                  Sign in
                </Button>
              </Form.Item>
            </Form>
          </Space>
        </Card>
      </Content>
    </Layout>
  )
}
