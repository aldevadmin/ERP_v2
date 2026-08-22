import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Alert, Breadcrumb, Button, Card, Form, Input, Switch, Typography } from 'antd'
import { ApiError } from '../../shared/api/http'
import { createStorageLocation, getStorageLocation, updateStorageLocation } from './api'
import type { StorageLocationFormValues } from './types'

const { Title } = Typography

export default function StorageLocationFormPage() {
  const { id } = useParams<{ id: string }>()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const [form] = Form.useForm<StorageLocationFormValues>()
  const [loading, setLoading] = useState(isEdit)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    getStorageLocation(Number(id))
      .then((location) => form.setFieldsValue(location))
      .catch(() => setError('Could not load this location.'))
      .finally(() => setLoading(false))
  }, [id, form])

  const handleSubmit = async (values: StorageLocationFormValues) => {
    setError(null)
    setSubmitting(true)
    try {
      if (id) {
        await updateStorageLocation(Number(id), values)
      } else {
        await createStorageLocation(values)
      }
      navigate('/storage-locations')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this location.')
    } finally {
      setSubmitting(false)
    }
  }

  const pageTitle = isEdit ? 'Edit Storage Location' : 'New Storage Location'

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 12 }}
        items={[
          { title: <Link to="/settings">Settings</Link> },
          { title: <Link to="/storage-locations">Storage Locations</Link> },
          { title: pageTitle },
        ]}
      />
      <Card style={{ maxWidth: 640, margin: '0 auto' }}>
        <Title level={4}>{pageTitle}</Title>
      {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}
      <Form<StorageLocationFormValues>
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        disabled={loading || submitting}
        initialValues={{ is_active: true }}
      >
        <Form.Item
          label="Name"
          name="name"
          rules={[{ required: true, message: 'Enter a location name.' }]}
        >
          <Input size="large" placeholder="e.g. Standard Warehouse" />
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
