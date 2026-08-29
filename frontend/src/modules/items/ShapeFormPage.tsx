import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Alert, Breadcrumb, Button, Card, Form, Input, Switch, Typography } from 'antd'
import { ApiError } from '../../shared/api/http'
import { createShape, getShape, updateShape } from './api'
import type { ShapeFormValues } from './types'

const { Title } = Typography

export default function ShapeFormPage() {
  const { id } = useParams<{ id: string }>()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const [form] = Form.useForm<ShapeFormValues>()
  const [loading, setLoading] = useState(isEdit)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    getShape(Number(id))
      .then((shape) => form.setFieldsValue(shape))
      .catch(() => setError('Could not load this shape.'))
      .finally(() => setLoading(false))
  }, [id, form])

  const handleSubmit = async (values: ShapeFormValues) => {
    setError(null)
    setSubmitting(true)
    try {
      if (id) {
        await updateShape(Number(id), values)
      } else {
        await createShape(values)
      }
      navigate('/shapes')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this shape.')
    } finally {
      setSubmitting(false)
    }
  }

  const pageTitle = isEdit ? 'Edit Shape' : 'New Shape'

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 12 }}
        items={[
          { title: <Link to="/settings">Settings</Link> },
          { title: <Link to="/shapes">Shapes</Link> },
          { title: pageTitle },
        ]}
      />
      <Card style={{ maxWidth: 640, margin: '0 auto' }}>
        <Title level={4}>{pageTitle}</Title>
        {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}
        <Form<ShapeFormValues>
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          disabled={loading || submitting}
          initialValues={{ is_active: true }}
        >
          <Form.Item
            label="Name"
            name="name"
            rules={[{ required: true, message: 'Enter a name.' }]}
          >
            <Input size="large" placeholder="e.g. Round" />
          </Form.Item>
          <Form.Item
            label="Short Code (optional)"
            name="short_code"
            tooltip="A 2-4 letter abbreviation (e.g. RD for Round) used when suggesting an Item Name/Code — leave blank if you don't need one."
          >
            <Input size="large" placeholder="e.g. RD" maxLength={4} style={{ maxWidth: 160 }} />
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
