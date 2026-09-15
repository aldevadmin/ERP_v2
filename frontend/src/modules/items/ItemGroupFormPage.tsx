import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Alert, Breadcrumb, Button, Card, Form, Input, Switch, Typography } from 'antd'
import { ApiError } from '../../shared/api/http'
import { createItemGroup, getItemGroup, updateItemGroup } from './api'
import type { ItemGroupFormValues } from './types'

const { Title } = Typography

export default function ItemGroupFormPage() {
  const { id } = useParams<{ id: string }>()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const [form] = Form.useForm<ItemGroupFormValues>()
  const [loading, setLoading] = useState(isEdit)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    getItemGroup(Number(id))
      .then((group) => form.setFieldsValue(group))
      .catch(() => setError('Could not load this Item Group.'))
      .finally(() => setLoading(false))
  }, [id, form])

  const handleSubmit = async (values: ItemGroupFormValues) => {
    setError(null)
    setSubmitting(true)
    try {
      if (id) {
        await updateItemGroup(Number(id), values)
      } else {
        await createItemGroup(values)
      }
      navigate('/item-groups')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this Item Group.')
    } finally {
      setSubmitting(false)
    }
  }

  const pageTitle = isEdit ? 'Edit Item Group' : 'New Item Group'

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 12 }}
        items={[
          { title: <Link to="/settings">Settings</Link> },
          { title: <Link to="/item-groups">Item Groups</Link> },
          { title: pageTitle },
        ]}
      />
      <Card style={{ maxWidth: 640, margin: '0 auto' }}>
        <Title level={4}>{pageTitle}</Title>
        {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}
        <Form<ItemGroupFormValues>
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          disabled={loading || submitting}
          initialValues={{ is_active: true }}
        >
          <Form.Item
            label="Name"
            name="name"
            tooltip='e.g. "WIP – Sorted Plate – Areca Palm – Sq10x10" — items interchangeable at this role/stage.'
            rules={[{ required: true, message: 'Enter a name.' }]}
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
