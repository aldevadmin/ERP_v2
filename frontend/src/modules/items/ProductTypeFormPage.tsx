import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Alert, Breadcrumb, Button, Card, Form, Input, Switch, Typography } from 'antd'
import { ApiError } from '../../shared/api/http'
import { createProductType, getProductType, updateProductType } from './api'
import type { ProductTypeFormValues } from './types'

const { Title } = Typography

export default function ProductTypeFormPage() {
  const { id } = useParams<{ id: string }>()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const [form] = Form.useForm<ProductTypeFormValues>()
  const [loading, setLoading] = useState(isEdit)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    getProductType(Number(id))
      .then((type) => form.setFieldsValue(type))
      .catch(() => setError('Could not load this product type.'))
      .finally(() => setLoading(false))
  }, [id, form])

  const handleSubmit = async (values: ProductTypeFormValues) => {
    setError(null)
    setSubmitting(true)
    try {
      if (id) {
        await updateProductType(Number(id), values)
      } else {
        await createProductType(values)
      }
      navigate('/product-types')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this product type.')
    } finally {
      setSubmitting(false)
    }
  }

  const pageTitle = isEdit ? 'Edit Product Type' : 'New Product Type'

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 12 }}
        items={[
          { title: <Link to="/settings">Settings</Link> },
          { title: <Link to="/product-types">Product Types</Link> },
          { title: pageTitle },
        ]}
      />
      <Card style={{ maxWidth: 640, margin: '0 auto' }}>
        <Title level={4}>{pageTitle}</Title>
        {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}
        <Form<ProductTypeFormValues>
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
            <Input size="large" placeholder="e.g. Plate" />
          </Form.Item>
          <Form.Item
            label="Short Code (optional)"
            name="short_code"
            tooltip="A 2-4 letter abbreviation (e.g. PL for Plate) used when suggesting an Item Name/Code — leave blank if you don't need one."
          >
            <Input size="large" placeholder="e.g. PL" maxLength={4} style={{ maxWidth: 160 }} />
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
