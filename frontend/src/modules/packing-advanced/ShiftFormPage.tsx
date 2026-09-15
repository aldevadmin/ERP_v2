import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Alert, Breadcrumb, Button, Card, Form, Input, Switch, TimePicker, Typography } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { ApiError } from '../../shared/api/http'
import { createShift, getShift, updateShift } from './api'

const { Title } = Typography

interface ShiftFormValues {
  name: string
  code: string
  start_time?: Dayjs | null
  end_time?: Dayjs | null
  is_active: boolean
}

export default function ShiftFormPage() {
  const { id } = useParams<{ id: string }>()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const [form] = Form.useForm<ShiftFormValues>()
  const [loading, setLoading] = useState(isEdit)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    getShift(Number(id))
      .then((shift) =>
        form.setFieldsValue({
          ...shift,
          start_time: shift.start_time ? dayjs(shift.start_time, 'HH:mm:ss') : null,
          end_time: shift.end_time ? dayjs(shift.end_time, 'HH:mm:ss') : null,
        }),
      )
      .catch(() => setError('Could not load this shift.'))
      .finally(() => setLoading(false))
  }, [id, form])

  const handleSubmit = async (values: ShiftFormValues) => {
    setError(null)
    setSubmitting(true)
    try {
      const payload = {
        name: values.name,
        code: values.code,
        start_time: values.start_time ? values.start_time.format('HH:mm:ss') : null,
        end_time: values.end_time ? values.end_time.format('HH:mm:ss') : null,
        is_active: values.is_active,
      }
      if (id) {
        await updateShift(Number(id), payload)
      } else {
        await createShift(payload)
      }
      navigate('/shifts')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this shift.')
    } finally {
      setSubmitting(false)
    }
  }

  const pageTitle = isEdit ? 'Edit Shift' : 'New Shift'

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 12 }}
        items={[
          { title: <Link to="/settings">Settings</Link> },
          { title: <Link to="/shifts">Shifts</Link> },
          { title: pageTitle },
        ]}
      />
      <Card style={{ maxWidth: 640, margin: '0 auto' }}>
        <Title level={4}>{pageTitle}</Title>
        {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}
        <Form<ShiftFormValues>
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          disabled={loading || submitting}
          initialValues={{ is_active: true }}
        >
          <Form.Item label="Name" name="name" rules={[{ required: true, message: 'Enter a name.' }]}>
            <Input size="large" placeholder="e.g. Shift 1" />
          </Form.Item>
          <Form.Item label="Code" name="code" rules={[{ required: true, message: 'Enter a code.' }]}>
            <Input size="large" placeholder="e.g. S1" />
          </Form.Item>
          <Form.Item label="Start Time (optional)" name="start_time">
            <TimePicker size="large" format="HH:mm" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="End Time (optional)" name="end_time">
            <TimePicker size="large" format="HH:mm" style={{ width: '100%' }} />
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
