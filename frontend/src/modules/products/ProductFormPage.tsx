import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Alert, Button, Card, Form, Input, Switch, Typography } from 'antd'
import { createProduct, getProduct, updateProduct } from './api'
import type { ProductFormValues } from './types'

const { Title } = Typography
const { TextArea } = Input

export default function ProductFormPage() {
  const { id } = useParams<{ id: string }>()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const [form] = Form.useForm<ProductFormValues>()
  const [loading, setLoading] = useState(isEdit)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    getProduct(Number(id))
      .then((product) => form.setFieldsValue(product))
      .catch(() => setError('Could not load this product.'))
      .finally(() => setLoading(false))
  }, [id, form])

  const handleSubmit = async (values: ProductFormValues) => {
    setError(null)
    setSubmitting(true)
    try {
      if (id) {
        await updateProduct(Number(id), values)
      } else {
        await createProduct(values)
      }
      navigate('/products')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save product.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card style={{ maxWidth: 640, margin: '0 auto' }}>
      <Title level={4}>{isEdit ? 'Edit Product' : 'New Product'}</Title>
      {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}
      <Form<ProductFormValues>
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        disabled={loading || submitting}
        initialValues={{ is_active: true }}
      >
        <Form.Item
          label="SKU Code"
          name="sku_code"
          rules={[{ required: true, message: 'Enter a SKU code.' }]}
        >
          <Input size="large" disabled={isEdit} />
        </Form.Item>
        <Form.Item
          label="Product Name"
          name="name"
          rules={[{ required: true, message: 'Enter a product name.' }]}
        >
          <Input size="large" />
        </Form.Item>
        <Form.Item label="Description" name="description">
          <TextArea rows={3} />
        </Form.Item>
        <Form.Item
          label="Base Unit"
          name="base_unit"
          rules={[{ required: true, message: 'Enter a base unit, e.g. Piece.' }]}
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
