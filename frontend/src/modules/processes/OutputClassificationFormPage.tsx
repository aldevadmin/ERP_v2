import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Alert, Breadcrumb, Button, Card, Form, Input, Switch, Typography } from 'antd'
import { ApiError } from '../../shared/api/http'
import {
  createOutputClassification,
  getOutputClassification,
  updateOutputClassification,
} from './api'
import type { OutputClassificationFormValues } from './types'

const { Title } = Typography

export default function OutputClassificationFormPage() {
  const { id } = useParams<{ id: string }>()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const [form] = Form.useForm<OutputClassificationFormValues>()
  const [loading, setLoading] = useState(isEdit)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    getOutputClassification(Number(id))
      .then((classification) => form.setFieldsValue(classification))
      .catch(() => setError('Could not load this classification.'))
      .finally(() => setLoading(false))
  }, [id, form])

  const handleSubmit = async (values: OutputClassificationFormValues) => {
    setError(null)
    setSubmitting(true)
    try {
      if (id) {
        await updateOutputClassification(Number(id), values)
      } else {
        await createOutputClassification(values)
      }
      navigate('/output-classifications')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save classification.')
    } finally {
      setSubmitting(false)
    }
  }

  const pageTitle = isEdit ? 'Edit Output Classification' : 'New Output Classification'

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 12 }}
        items={[
          { title: <Link to="/settings">Settings</Link> },
          { title: <Link to="/output-classifications">Output Classifications</Link> },
          { title: pageTitle },
        ]}
      />
      <Card style={{ maxWidth: 640, margin: '0 auto' }}>
        <Title level={4}>{pageTitle}</Title>
      {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}
      <Form<OutputClassificationFormValues>
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        disabled={loading || submitting}
        initialValues={{ is_active: true }}
      >
        <Form.Item
          label="Name"
          name="name"
          rules={[{ required: true, message: 'Enter a classification name.' }]}
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
    </div>
  )
}
