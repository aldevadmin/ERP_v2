import { useEffect, useState } from 'react'
import { Alert, DatePicker, Descriptions, Form, InputNumber, Modal, Select, Typography } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { ApiError } from '../../shared/api/http'
import { listBays } from '../work-centres/api'
import type { Bay } from '../work-centres/types'
import { createPackingPlanLine, listShifts } from './api'
import type { PackingDemandRow, Shift } from './types'

const { Text } = Typography

interface FormValues {
  date: Dayjs
  shift: number
  bay: number
  planned_qty: number
}

export default function PlanPackingModal({
  open,
  row,
  onClose,
  onCreated,
}: {
  open: boolean
  row: PackingDemandRow | null
  onClose: () => void
  onCreated: () => void
}) {
  const [form] = Form.useForm<FormValues>()
  const [shifts, setShifts] = useState<Shift[]>([])
  const [bays, setBays] = useState<Bay[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const plannedQty = Form.useWatch('planned_qty', form)

  useEffect(() => {
    listShifts({ isActive: true }).then((response) => setShifts(response.results))
    listBays({ isActive: true }).then((response) => setBays(response.results))
  }, [])

  useEffect(() => {
    if (open) {
      form.resetFields()
      setError(null)
      form.setFieldsValue({ date: dayjs() })
    }
  }, [open, form])

  if (!row) return null

  const plannableRemaining = row.balance_qty - row.planned_qty
  const remainingAfter = plannableRemaining - (plannedQty || 0)

  const handleSubmit = async (values: FormValues) => {
    setError(null)
    setSubmitting(true)
    try {
      await createPackingPlanLine({
        export_order_line: row.export_order_line_id,
        date: values.date.format('YYYY-MM-DD'),
        shift: values.shift,
        bay: values.bay,
        planned_qty: values.planned_qty,
      })
      onCreated()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create this plan.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title="Plan Packing"
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={submitting}
      okText="Create Plan"
      destroyOnHidden
    >
      {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}
      <Descriptions column={1} size="small" style={{ marginBottom: 16 }}>
        <Descriptions.Item label="Order">
          {row.order_no} • {row.customer_name}
        </Descriptions.Item>
        <Descriptions.Item label="SKU">
          {row.item_name} ({row.item_code})
        </Descriptions.Item>
        <Descriptions.Item label="Balance to Pack">
          {plannableRemaining.toLocaleString()} pcs
        </Descriptions.Item>
      </Descriptions>
      <Form<FormValues> form={form} layout="vertical" onFinish={handleSubmit}>
        <Form.Item label="Date" name="date" rules={[{ required: true, message: 'Select a date.' }]}>
          <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
        </Form.Item>
        <Form.Item label="Shift" name="shift" rules={[{ required: true, message: 'Select a shift.' }]}>
          <Select options={shifts.map((s) => ({ value: s.id, label: s.name }))} />
        </Form.Item>
        <Form.Item label="Bay" name="bay" rules={[{ required: true, message: 'Select a bay.' }]}>
          <Select options={bays.map((b) => ({ value: b.id, label: b.name }))} />
        </Form.Item>
        <Form.Item
          label="Quantity"
          name="planned_qty"
          rules={[
            { required: true, message: 'Enter a quantity.' },
            {
              validator: (_, value: number) =>
                value > 0 && value <= plannableRemaining
                  ? Promise.resolve()
                  : Promise.reject(
                      new Error(`Must be between 1 and ${plannableRemaining.toLocaleString()}.`),
                    ),
            },
          ]}
        >
          <InputNumber min={1} max={plannableRemaining} style={{ width: '100%' }} suffix="pcs" />
        </Form.Item>
        {plannedQty > 0 && (
          <Text type="secondary" style={{ display: 'block', marginTop: -12 }}>
            Remaining after this plan: {Math.max(remainingAfter, 0).toLocaleString()} pcs
          </Text>
        )}
      </Form>
    </Modal>
  )
}
