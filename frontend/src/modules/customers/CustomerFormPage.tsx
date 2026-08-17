import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Alert, Button, Card, Divider, Form, Input, Select, Space, Switch, Typography } from 'antd'
import { listEmployees } from '../accounts/api'
import type { Employee } from '../accounts/types'
import { createCustomer, getCustomer, updateCustomer } from './api'
import type { CustomerFormValues } from './types'

const { Title } = Typography

const ADDRESS_TYPE_OPTIONS = [
  { value: 'BILLING', label: 'Billing' },
  { value: 'SHIPPING', label: 'Shipping' },
  { value: 'BILLING_AND_SHIPPING', label: 'Billing & Shipping' },
]

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validateEmails(_rule: unknown, value: string[] | undefined) {
  const invalid = (value ?? []).filter((email) => !EMAIL_PATTERN.test(email))
  if (invalid.length > 0) {
    return Promise.reject(new Error(`Not a valid email: ${invalid.join(', ')}`))
  }
  return Promise.resolve()
}

export default function CustomerFormPage() {
  const { id } = useParams<{ id: string }>()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const [form] = Form.useForm<CustomerFormValues>()
  const [loading, setLoading] = useState(isEdit)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [employees, setEmployees] = useState<Employee[]>([])

  useEffect(() => {
    if (!id) return
    getCustomer(Number(id))
      .then((customer) => form.setFieldsValue(customer))
      .catch(() => setError('Could not load this customer.'))
      .finally(() => setLoading(false))
  }, [id, form])

  useEffect(() => {
    listEmployees().then((response) => setEmployees(response.results))
  }, [])

  const handleSubmit = async (values: CustomerFormValues) => {
    setError(null)
    setSubmitting(true)
    try {
      const customer = id
        ? await updateCustomer(Number(id), values)
        : await createCustomer(values)
      navigate(`/customers/${customer.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save customer.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card style={{ maxWidth: 720, margin: '0 auto' }}>
      <Title level={4}>{isEdit ? 'Edit Customer' : 'New Customer'}</Title>
      {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}
      <Form<CustomerFormValues>
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        disabled={loading || submitting}
        initialValues={{ is_active: true, emails: [], phone_numbers: [], addresses: [] }}
      >
        <Form.Item
          label="Customer Code"
          name="code"
          rules={[{ required: true, message: 'Enter a customer code.' }]}
        >
          <Input size="large" disabled={isEdit} />
        </Form.Item>
        <Form.Item
          label="Customer Name"
          name="name"
          rules={[{ required: true, message: 'Enter a customer name.' }]}
        >
          <Input size="large" />
        </Form.Item>
        <Form.Item label="Main PoC" name="main_poc">
          <Input size="large" />
        </Form.Item>
        <Form.Item
          label="Email IDs"
          name="emails"
          help="Type an address and press Enter to add another"
          rules={[{ validator: validateEmails }]}
        >
          <Select mode="tags" size="large" tokenSeparators={[',', ' ']} options={[]} />
        </Form.Item>
        <Form.Item
          label="Phone Number(s)"
          name="phone_numbers"
          help="Include the country code — type a number and press Enter to add another"
        >
          <Select mode="tags" size="large" tokenSeparators={[',', ' ']} options={[]} />
        </Form.Item>
        <Form.Item label="Internal Customer Coordinator" name="internal_coordinator">
          <Select
            allowClear
            size="large"
            options={employees.map((e) => ({ value: e.id, label: e.full_name }))}
            showSearch
            optionFilterProp="label"
          />
        </Form.Item>
        <Form.Item label="Active" name="is_active" valuePropName="checked">
          <Switch />
        </Form.Item>

        <Divider>Addresses</Divider>

        <Form.List name="addresses">
          {(fields, { add, remove }) => (
            <Space orientation="vertical" style={{ width: '100%' }} size="middle">
              {fields.map((field) => (
                <Card key={field.key} size="small" type="inner">
                  <Form.Item name={[field.name, 'id']} hidden>
                    <Input />
                  </Form.Item>
                  <Form.Item
                    label="Address Type"
                    name={[field.name, 'address_type']}
                    rules={[{ required: true, message: 'Select an address type.' }]}
                  >
                    <Select options={ADDRESS_TYPE_OPTIONS} style={{ maxWidth: 240 }} />
                  </Form.Item>
                  <Form.Item
                    label="Country"
                    name={[field.name, 'country']}
                    rules={[{ required: true, message: 'Enter the country.' }]}
                  >
                    <Input />
                  </Form.Item>
                  <Form.Item label="State" name={[field.name, 'state']}>
                    <Input />
                  </Form.Item>
                  <Form.Item
                    label="Address Line 1"
                    name={[field.name, 'line1']}
                    rules={[{ required: true, message: 'Enter the address line.' }]}
                  >
                    <Input />
                  </Form.Item>
                  <Form.Item label="Address Line 2" name={[field.name, 'line2']}>
                    <Input />
                  </Form.Item>
                  <Form.Item label="Address Line 3" name={[field.name, 'line3']}>
                    <Input />
                  </Form.Item>
                  <Form.Item label="PIN" name={[field.name, 'pin']}>
                    <Input style={{ maxWidth: 160 }} />
                  </Form.Item>
                  <Button danger onClick={() => remove(field.name)}>
                    Remove address
                  </Button>
                </Card>
              ))}
              <Button type="dashed" onClick={() => add()} block>
                Add Address
              </Button>
            </Space>
          )}
        </Form.List>

        <Form.Item style={{ marginTop: 24 }}>
          <Button type="primary" htmlType="submit" size="large" loading={submitting}>
            Save
          </Button>
        </Form.Item>
      </Form>
    </Card>
  )
}
