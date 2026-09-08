import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Alert, Breadcrumb, Button, Card, Form, Input, Select, Switch, Typography } from 'antd'
import { ApiError } from '../../shared/api/http'
import { createEmployee, getEmployee, listTeams, updateEmployee } from './api'
import type { EmployeeFormValues, Team } from './types'

const { Title } = Typography

export default function OperatorFormPage() {
  const { id } = useParams<{ id: string }>()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const [form] = Form.useForm<EmployeeFormValues>()
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(isEdit)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listTeams().then((response) => setTeams(response.results))
  }, [])

  useEffect(() => {
    if (!id) return
    getEmployee(Number(id))
      .then((operator) => form.setFieldsValue(operator))
      .catch(() => setError('Could not load this operator.'))
      .finally(() => setLoading(false))
  }, [id, form])

  const handleSubmit = async (values: EmployeeFormValues) => {
    setError(null)
    setSubmitting(true)
    try {
      if (id) {
        await updateEmployee(Number(id), values)
      } else {
        await createEmployee(values)
      }
      navigate('/operators')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this operator.')
    } finally {
      setSubmitting(false)
    }
  }

  const pageTitle = isEdit ? 'Edit Operator' : 'New Operator'

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 12 }}
        items={[
          { title: <Link to="/settings">Settings</Link> },
          { title: <Link to="/operators">Operators</Link> },
          { title: pageTitle },
        ]}
      />
      <Card style={{ maxWidth: 640, margin: '0 auto' }}>
        <Title level={4}>{pageTitle}</Title>
        {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}
        <Form<EmployeeFormValues>
          form={form}
          layout="vertical"
          onFinish={(values) => void handleSubmit(values)}
          disabled={loading || submitting}
          initialValues={{ is_active: true }}
        >
          <Form.Item
            label="Employee Code"
            name="employee_code"
            rules={[{ required: true, message: 'Enter an employee code.' }]}
          >
            <Input size="large" placeholder="e.g. EMP-003" />
          </Form.Item>
          <Form.Item
            label="Full Name"
            name="full_name"
            rules={[{ required: true, message: 'Enter a name.' }]}
          >
            <Input size="large" placeholder="e.g. Sunita" />
          </Form.Item>
          <Form.Item label="Team (optional)" name="team">
            <Select
              allowClear
              size="large"
              style={{ maxWidth: 280 }}
              placeholder="No team"
              options={teams.map((t) => ({ value: t.id, label: t.name }))}
            />
          </Form.Item>
          <Form.Item label="Designation (optional)" name="designation">
            <Input size="large" placeholder="e.g. Packing Operator" />
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
