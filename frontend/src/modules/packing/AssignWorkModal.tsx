import { useEffect, useState } from 'react'
import { Alert, Form, InputNumber, Modal, Select, Typography } from 'antd'
import { ApiError } from '../../shared/api/http'
import { assignWork, listAssignableJobs } from './api'
import type { PackingJob } from './types'

const { Text } = Typography

interface FormValues {
  job: number
  assigned_qty: number
}

export default function AssignWorkModal({
  open,
  sessionId,
  onClose,
  onAssigned,
}: {
  open: boolean
  sessionId: number | null
  onClose: () => void
  onAssigned: () => void
}) {
  const [form] = Form.useForm<FormValues>()
  const [jobs, setJobs] = useState<PackingJob[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const selectedJobId = Form.useWatch('job', form)
  const selectedJob = jobs.find((j) => j.id === selectedJobId) ?? null

  useEffect(() => {
    if (open && sessionId) {
      form.resetFields()
      setError(null)
      listAssignableJobs(sessionId).then((response) => setJobs(response))
    }
  }, [open, sessionId, form])

  if (!sessionId) return null

  const remaining = selectedJob ? selectedJob.target_qty - selectedJob.allocated_qty : 0

  const handleSubmit = async (values: FormValues) => {
    setError(null)
    setSubmitting(true)
    try {
      await assignWork(sessionId, values)
      onAssigned()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not assign this work.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title="Assign Work"
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={submitting}
      okText="Assign"
      destroyOnHidden
    >
      {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}
      <Form<FormValues> form={form} layout="vertical" onFinish={(values) => void handleSubmit(values)}>
        <Form.Item label="Order / SKU" name="job" rules={[{ required: true, message: 'Select a job.' }]}>
          <Select
            showSearch
            optionFilterProp="label"
            placeholder="Search Order/SKU"
            options={jobs.map((j) => ({
              value: j.id,
              label: `${j.job_number} — ${j.order_no} — ${j.item_name}`,
            }))}
          />
        </Form.Item>
        {selectedJob && (
          <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
            Balance to allocate: {remaining.toLocaleString()} pcs
          </Text>
        )}
        <Form.Item
          label="Quantity"
          name="assigned_qty"
          rules={[
            { required: true, message: 'Enter a quantity.' },
            {
              validator: (_, value: number) =>
                !selectedJob || (value > 0 && value <= remaining)
                  ? Promise.resolve()
                  : Promise.reject(new Error(`Must be between 1 and ${remaining.toLocaleString()}.`)),
            },
          ]}
        >
          <InputNumber min={1} style={{ width: '100%' }} suffix="pcs" />
        </Form.Item>
      </Form>
    </Modal>
  )
}
