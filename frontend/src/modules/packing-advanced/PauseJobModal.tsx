import { useEffect, useState } from 'react'
import { Alert, Form, Input, Modal, Radio, Select } from 'antd'
import { ApiError } from '../../shared/api/http'
import { holdPackingJob } from './api'
import type { PackingJob } from './types'

const REASON_OPTIONS = [
  'Quality Issue',
  'Material Issue',
  'Machine Issue',
  'Priority Change',
  'Other',
]

interface FormValues {
  reason: string
  remarks?: string
  release_work_centres: boolean
}

export default function PauseJobModal({
  open,
  job,
  onClose,
  onPaused,
}: {
  open: boolean
  job: PackingJob | null
  onClose: () => void
  onPaused: () => void
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
      await holdPackingJob(job.id, values)
      onPaused()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not pause this Job.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title={`Pause ${job.job_number}`}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={submitting}
      okText="Pause Job"
      destroyOnHidden
    >
      {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}
      <Form<FormValues>
        form={form}
        layout="vertical"
        onFinish={(values) => void handleSubmit(values)}
        initialValues={{ release_work_centres: false }}
      >
        <Form.Item
          label="Pause Reason"
          name="reason"
          rules={[{ required: true, message: 'Select a reason.' }]}
        >
          <Select options={REASON_OPTIONS.map((r) => ({ value: r, label: r }))} />
        </Form.Item>
        <Form.Item label="Details" name="remarks">
          <Input.TextArea rows={2} placeholder="Optional details..." />
        </Form.Item>
        <Form.Item
          label="What should happen to assigned Work Centres?"
          name="release_work_centres"
        >
          <Radio.Group
            options={[
              { value: false, label: 'Keep them reserved for this job' },
              { value: true, label: 'Make them available for another job' },
            ]}
            optionType="button"
          />
        </Form.Item>
      </Form>
    </Modal>
  )
}
