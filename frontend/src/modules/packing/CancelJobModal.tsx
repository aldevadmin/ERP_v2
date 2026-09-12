import { useEffect, useState } from 'react'
import { Alert, Form, Input, Modal } from 'antd'
import { ApiError } from '../../shared/api/http'
import { cancelPackingJob } from './api'
import type { PackingJob } from './types'

interface FormValues {
  reason: string
}

export default function CancelJobModal({
  open,
  job,
  onClose,
  onCancelled,
}: {
  open: boolean
  job: PackingJob | null
  onClose: () => void
  onCancelled: () => void
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
      await cancelPackingJob(job.id, values.reason)
      onCancelled()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not cancel this Job.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title={`Cancel ${job.job_number}`}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={submitting}
      okText="Cancel Job"
      okButtonProps={{ danger: true }}
      destroyOnHidden
    >
      {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}
      <Form<FormValues> form={form} layout="vertical" onFinish={(values) => void handleSubmit(values)}>
        <Form.Item
          label="Reason"
          name="reason"
          rules={[{ required: true, message: 'A reason is required to cancel a Job.' }]}
        >
          <Input.TextArea rows={3} placeholder="e.g. Quality issue with raw material, priority change..." />
        </Form.Item>
      </Form>
    </Modal>
  )
}
