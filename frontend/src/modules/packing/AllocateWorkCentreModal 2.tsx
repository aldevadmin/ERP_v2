import { useEffect, useState } from 'react'
import { Alert, Form, InputNumber, Modal, Select, Typography } from 'antd'
import { ApiError } from '../../shared/api/http'
import { listEmployees } from '../accounts/api'
import type { Employee } from '../accounts/types'
import { listWorkCentres } from '../work-centres/api'
import type { WorkCentre } from '../work-centres/types'
import { createJobAllocation } from './api'
import type { PackingJob } from './types'

const { Text } = Typography

interface FormValues {
  work_centre: number
  operator_ids: number[]
  assigned_qty: number
}

export default function AllocateWorkCentreModal({
  open,
  job,
  onClose,
  onCreated,
}: {
  open: boolean
  job: PackingJob | null
  onClose: () => void
  onCreated: () => void
}) {
  const [form] = Form.useForm<FormValues>()
  const [workCentres, setWorkCentres] = useState<WorkCentre[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const assignedQty = Form.useWatch('assigned_qty', form)

  useEffect(() => {
    if (job) {
      listWorkCentres({ isActive: true }).then((response) =>
        setWorkCentres(response.results.filter((wc) => wc.bay === job.bay)),
      )
    }
    listEmployees().then((response) => setEmployees(response.results))
  }, [job])

  useEffect(() => {
    if (open) {
      form.resetFields()
      setError(null)
    }
  }, [open, form])

  if (!job) return null

  const remaining = job.target_qty - job.allocated_qty
  const remainingAfter = remaining - (assignedQty || 0)

  const handleSubmit = async (values: FormValues) => {
    setError(null)
    setSubmitting(true)
    try {
      await createJobAllocation(job.id, {
        work_centre: values.work_centre,
        assigned_qty: values.assigned_qty,
        operator_ids: values.operator_ids,
      })
      onCreated()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not allocate this work centre.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title="Allocate Work Centre"
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={submitting}
      okText="Allocate"
      destroyOnHidden
    >
      {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}
      <Form<FormValues> form={form} layout="vertical" onFinish={handleSubmit}>
        <Form.Item
          label="Work Centre"
          name="work_centre"
          rules={[{ required: true, message: 'Select a work centre.' }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            options={workCentres.map((wc) => ({ value: wc.id, label: `${wc.code} — ${wc.name}` }))}
          />
        </Form.Item>
        <Form.Item
          label="Operators"
          name="operator_ids"
          rules={[{ required: true, message: 'Select at least one operator.' }]}
        >
          <Select
            mode="multiple"
            showSearch
            optionFilterProp="label"
            options={employees.map((e) => ({ value: e.id, label: e.full_name }))}
          />
        </Form.Item>
        <Form.Item
          label="Quantity"
          name="assigned_qty"
          rules={[
            { required: true, message: 'Enter a quantity.' },
            {
              validator: (_, value: number) =>
                value > 0 && value <= remaining
                  ? Promise.resolve()
                  : Promise.reject(new Error(`Must be between 1 and ${remaining.toLocaleString()}.`)),
            },
          ]}
        >
          <InputNumber min={1} max={remaining} style={{ width: '100%' }} suffix="pcs" />
        </Form.Item>
        <Text type="secondary">Remaining: {Math.max(remainingAfter, 0).toLocaleString()} pcs</Text>
      </Form>
    </Modal>
  )
}
