import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import {
  Alert,
  Breadcrumb,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Switch,
  Typography,
} from 'antd'
import { ApiError } from '../../shared/api/http'
import { createUOM, getUOM, updateUOM } from './api'
import type { UOMFormValues } from './types'

const { Title } = Typography

export default function UOMFormPage() {
  const { id } = useParams<{ id: string }>()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const [form] = Form.useForm<UOMFormValues>()
  const [loading, setLoading] = useState(isEdit)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    getUOM(Number(id))
      .then((uom) => form.setFieldsValue(uom))
      .catch(() => setError('Could not load this unit.'))
      .finally(() => setLoading(false))
  }, [id, form])

  const handleSubmit = async (values: UOMFormValues) => {
    setError(null)
    setSubmitting(true)
    try {
      if (id) {
        await updateUOM(Number(id), values)
      } else {
        await createUOM(values)
      }
      navigate('/uoms')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this unit.')
    } finally {
      setSubmitting(false)
    }
  }

  const pageTitle = isEdit ? 'Edit Unit of Measure' : 'New Unit of Measure'

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 12 }}
        items={[
          { title: <Link to="/settings">Settings</Link> },
          { title: <Link to="/uoms">Units of Measure</Link> },
          { title: pageTitle },
        ]}
      />
      <Card style={{ maxWidth: 640, margin: '0 auto' }}>
        <Title level={4}>{pageTitle}</Title>
        {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}
        <Form<UOMFormValues>
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          disabled={loading || submitting}
          initialValues={{ is_active: true, decimal_scale: 0 }}
        >
          <Form.Item
            label="Code"
            name="code"
            rules={[{ required: true, message: 'Enter a code.' }]}
          >
            <Input size="large" disabled={isEdit} placeholder="e.g. KG" />
          </Form.Item>
          <Form.Item
            label="Name"
            name="name"
            rules={[{ required: true, message: 'Enter a name.' }]}
          >
            <Input size="large" placeholder="e.g. Kilogram" />
          </Form.Item>
          <Form.Item
            label="Decimal Places"
            name="decimal_scale"
            rules={[{ required: true, message: 'Enter the number of decimal places.' }]}
            tooltip="How many decimal places this unit allows — 0 for whole units like Piece or Carton, more for fractional units like Kilogram."
          >
            <InputNumber style={{ width: '100%' }} min={0} max={4} />
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
