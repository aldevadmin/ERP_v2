import { useEffect, useState } from 'react'
import { Alert, Form, Input, Modal, Radio, Select } from 'antd'
import { ApiError } from '../../shared/api/http'
import { stopPackingJob } from './api'
import type { PackingJob } from './types'

const REASON_OPTIONS = ['Order Changed', 'Material Unavailable', 'Quality Issue', 'Other']

interface FormValues {
  reason: string
  remarks?: string
  return_to_demand: boolean
}

export default function StopJobModal({
  open,
  job,
  onClose,
  onStopped,
}: {
  open: boolean
  job: PackingJob | null
  onClose: () => void
  onStopped: () => void
}) {
  const [form] = Form.useForm<FormValues>()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      form.resetFields()
      setError(null)
    }
  }, [open, form])

  if (!job) return null

  const handleSubmit = async (values: FormValues) => {
    setError(null)
    setSubmitting(true)
    try {
      await stopPackingJob(job.id, values)
      onStopped()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not stop this Job.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title={`Stop ${job.job_number}`}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={submitting}
      okText="Stop Job"
      okButtonProps={{ danger: true }}
      destroyOnHidden
    >
      {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}
      <Form<FormValues>
        form={form}
        layout="vertical"
        onFinish={(values) => void handleSubmit(values)}
        initialValues={{ return_to_demand: true }}
      >
        <Form.Item label="Target" style={{ marginBottom: 4 }}>
          {job.packed_qty.toLocaleString()} / {job.target_qty.toLocaleString()} packed — Balance{' '}
          {job.balance_qty.toLocaleString()} pcs
        </Form.Item>
        <Form.Item
          label="Reason"
          name="reason"
          rules={[{ required: true, message: 'Select a reason.' }]}
        >
          <Select options={REASON_OPTIONS.map((r) => ({ value: r, label: r }))} />
        </Form.Item>
        <Form.Item label="What happens to the remaining quantity?" name="return_to_demand">
          <Radio.Group
            options={[
              { value: true, label: 'Return to Unplanned Packing Demand' },
              { value: false, label: 'Cancel remaining requirement' },
            ]}
            optionType="button"
          />
        </Form.Item>
        <Form.Item label="Notes" name="remarks">
          <Input.TextArea rows={2} />
        </Form.Item>
      </Form>
    </Modal>
  )
}
