import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Alert, Button, Card, Form, Input, Switch, Typography } from 'antd'
import { ApiError } from '../../shared/api/http'
import { createProcessCategory, getProcessCategory, updateProcessCategory } from './api'
import type { ProcessCategoryFormValues } from './types'

const { Title } = Typography

export default function ProcessCategoryFormPage() {
  const { id } = useParams<{ id: string }>()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const [form] = Form.useForm<ProcessCategoryFormValues>()
  const [loading, setLoading] = useState(isEdit)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    getProcessCategory(Number(id))
      .then((category) => form.setFieldsValue(category))
      .catch(() => setError('Could not load this category.'))
      .finally(() => setLoading(false))
  }, [id, form])

  const handleSubmit = async (values: ProcessCategoryFormValues) => {
    setError(null)
    setSubmitting(true)
    try {
      if (id) {
        await updateProcessCategory(Number(id), values)
      } else {
        await createProcessCategory(values)
      }
      navigate('/process-categories')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save category.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card style={{ maxWidth: 640, margin: '0 auto' }}>
      <Title level={4}>{isEdit ? 'Edit Process Category' : 'New Process Category'}</Title>
      {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}
      <Form<ProcessCategoryFormValues>
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        disabled={loading || submitting}
        initialValues={{ is_active: true }}
      >
        <Form.Item
          label="Name"
          name="name"
          rules={[{ required: true, message: 'Enter a category name.' }]}
        >
          <Input size="large" />
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
