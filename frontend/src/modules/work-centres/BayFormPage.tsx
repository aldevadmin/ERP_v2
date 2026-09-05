import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Alert, Breadcrumb, Button, Card, Form, Input, Switch, Typography } from 'antd'
import { ApiError } from '../../shared/api/http'
import { createBay, getBay, updateBay } from './api'
import type { BayFormValues } from './types'

const { Title } = Typography

export default function BayFormPage() {
  const { id } = useParams<{ id: string }>()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const [form] = Form.useForm<BayFormValues>()
  const [loading, setLoading] = useState(isEdit)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    getBay(Number(id))
      .then((bay) => form.setFieldsValue(bay))
      .catch(() => setError('Could not load this bay.'))
      .finally(() => setLoading(false))
  }, [id, form])

  const handleSubmit = async (values: BayFormValues) => {
    setError(null)
    setSubmitting(true)
    try {
      if (id) {
        await updateBay(Number(id), values)
      } else {
        await createBay(values)
      }
      navigate('/bays')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this bay.')
    } finally {
      setSubmitting(false)
    }
  }

  const pageTitle = isEdit ? 'Edit Bay' : 'New Bay'

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 12 }}
        items={[
          { title: <Link to="/settings">Settings</Link> },
          { title: <Link to="/bays">Bays</Link> },
          { title: pageTitle },
        ]}
      />
      <Card style={{ maxWidth: 640, margin: '0 auto' }}>
        <Title level={4}>{pageTitle}</Title>
        {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}
        <Form<BayFormValues>
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          disabled={loading || submitting}
          initialValues={{ is_active: true }}
        >
          <Form.Item label="Name" name="name" rules={[{ required: true, message: 'Enter a name.' }]}>
            <Input size="large" placeholder="e.g. Bay 1" />
          </Form.Item>
          <Form.Item label="Code" name="code" rules={[{ required: true, message: 'Enter a code.' }]}>
            <Input size="large" placeholder="e.g. BAY1" />
          </Form.Item>
          <Form.Item label="Active" name="is_active" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item style={{ marginTop: 24 }}>
            <Button type="primary" htmlType="submit" size="large" loading={submitting}>
              Save
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}
