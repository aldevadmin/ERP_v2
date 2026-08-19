import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Alert, Button, Card, Form, Input, Switch, Typography } from 'antd'
import { ApiError } from '../../shared/api/http'
import { createMaterial, getMaterial, updateMaterial } from './api'
import type { MaterialFormValues } from './types'

const { Title } = Typography

export default function MaterialFormPage() {
  const { id } = useParams<{ id: string }>()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const [form] = Form.useForm<MaterialFormValues>()
  const [loading, setLoading] = useState(isEdit)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    getMaterial(Number(id))
      .then((material) => form.setFieldsValue(material))
      .catch(() => setError('Could not load this material.'))
      .finally(() => setLoading(false))
  }, [id, form])

  const handleSubmit = async (values: MaterialFormValues) => {
    setError(null)
    setSubmitting(true)
    try {
      if (id) {
        await updateMaterial(Number(id), values)
      } else {
        await createMaterial(values)
      }
      navigate('/materials')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save material.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card style={{ maxWidth: 640, margin: '0 auto' }}>
      <Title level={4}>{isEdit ? 'Edit Material' : 'New Material'}</Title>
      {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}
      <Form<MaterialFormValues>
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        disabled={loading || submitting}
        initialValues={{ is_active: true }}
      >
        <Form.Item
          label="Code"
          name="code"
          rules={[{ required: true, message: 'Enter a material code.' }]}
        >
          <Input size="large" disabled={isEdit} />
        </Form.Item>
        <Form.Item
          label="Name"
          name="name"
          rules={[{ required: true, message: 'Enter a material name.' }]}
        >
          <Input size="large" />
        </Form.Item>
        <Form.Item
          label="Unit"
          name="unit"
          rules={[{ required: true, message: 'Enter a unit, e.g. Kg.' }]}
        >
          <Input size="large" style={{ maxWidth: 200 }} />
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
  )
}
