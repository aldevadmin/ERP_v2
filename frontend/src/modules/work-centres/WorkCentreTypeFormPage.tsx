import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Alert, Breadcrumb, Button, Card, Form, Input, Switch, Typography } from 'antd'
import { ApiError } from '../../shared/api/http'
import { createWorkCentreType, getWorkCentreType, updateWorkCentreType } from './api'
import type { WorkCentreTypeFormValues } from './types'

const { Title } = Typography

export default function WorkCentreTypeFormPage() {
  const { id } = useParams<{ id: string }>()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const [form] = Form.useForm<WorkCentreTypeFormValues>()
  const [loading, setLoading] = useState(isEdit)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    getWorkCentreType(Number(id))
      .then((type) => form.setFieldsValue(type))
      .catch(() => setError('Could not load this type.'))
      .finally(() => setLoading(false))
  }, [id, form])

  const handleSubmit = async (values: WorkCentreTypeFormValues) => {
    setError(null)
    setSubmitting(true)
    try {
      if (id) {
        await updateWorkCentreType(Number(id), values)
      } else {
        await createWorkCentreType(values)
      }
      navigate('/work-centre-types')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this type.')
    } finally {
      setSubmitting(false)
    }
  }

  const pageTitle = isEdit ? 'Edit Work Centre Type' : 'New Work Centre Type'

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 12 }}
        items={[
          { title: <Link to="/settings">Settings</Link> },
          { title: <Link to="/work-centre-types">Work Centre Types</Link> },
          { title: pageTitle },
        ]}
      />
      <Card style={{ maxWidth: 640, margin: '0 auto' }}>
        <Title level={4}>{pageTitle}</Title>
      {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}
      <Form<WorkCentreTypeFormValues>
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
          <Input size="large" placeholder="e.g. Machine" />
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
