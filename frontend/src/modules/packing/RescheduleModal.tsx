import { useEffect, useState } from 'react'
import { Alert, DatePicker, Form, InputNumber, Modal, Select, Typography } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { ApiError } from '../../shared/api/http'
import { listShifts, reschedulePackingPlanLine } from './api'
import { listBays } from '../work-centres/api'
import type { Bay } from '../work-centres/types'
import type { PackingPlanLine, Shift } from './types'

const { Text } = Typography

interface FormValues {
  date: Dayjs
  shift: number
  bay: number
  quantity?: number
}

export type ReschedulableLine = Pick<
  PackingPlanLine,
  'id' | 'plan_code' | 'date' | 'shift' | 'bay' | 'has_job' | 'job_target_qty' | 'job_packed_qty'
>

export default function RescheduleModal({
  open,
  line,
  onClose,
  onRescheduled,
}: {
  open: boolean
  line: ReschedulableLine | null
  onClose: () => void
  onRescheduled: () => void
}) {
  const [form] = Form.useForm<FormValues>()
  const [shifts, setShifts] = useState<Shift[]>([])
  const [bays, setBays] = useState<Bay[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open && line) {
      form.resetFields()
      setError(null)
      listShifts({ isActive: true }).then((response) => setShifts(response.results))
      listBays({ isActive: true }).then((response) => setBays(response.results))
      const balance = line.has_job ? (line.job_target_qty ?? 0) - (line.job_packed_qty ?? 0) : undefined
      form.setFieldsValue({
        date: dayjs(line.date),
        shift: line.shift,
        bay: line.bay,
        quantity: balance,
      })
    }
  }, [open, line, form])

  if (!line) return null

  const handleSubmit = async (values: FormValues) => {
    setError(null)
    setSubmitting(true)
    try {
      const result = await reschedulePackingPlanLine(line.id, {
        date: values.date.format('YYYY-MM-DD'),
        shift: values.shift,
        bay: values.bay,
        quantity: line.has_job ? values.quantity : undefined,
      })
      onRescheduled()
      void result
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reschedule this plan.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title="Reschedule"
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={submitting}
      okText="Reschedule"
      destroyOnHidden
    >
      {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        {line.plan_code}
      </Text>
      <Form<FormValues> form={form} layout="vertical" onFinish={(values) => void handleSubmit(values)}>
        <Form.Item label="Date" name="date" rules={[{ required: true, message: 'Pick a date.' }]}>
          <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
        </Form.Item>
        <Form.Item label="Shift" name="shift" rules={[{ required: true, message: 'Pick a shift.' }]}>
          <Select options={shifts.map((s) => ({ value: s.id, label: s.name }))} />
        </Form.Item>
        <Form.Item label="Bay" name="bay" rules={[{ required: true, message: 'Pick a bay.' }]}>
          <Select options={bays.map((b) => ({ value: b.id, label: b.name }))} />
        </Form.Item>
        {line.has_job && (
          <Form.Item
            label="Quantity to carry forward"
            name="quantity"
            rules={[{ required: true, message: 'Enter a quantity.' }]}
            extra="Defaults to the outstanding balance — reduce it if you want to write some of it off instead of carrying it all forward."
          >
            <InputNumber min={1} style={{ width: '100%' }} suffix="pcs" />
          </Form.Item>
        )}
      </Form>
    </Modal>
  )
}
