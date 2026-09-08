import { useEffect, useState } from 'react'
import { Alert, Form, Input, Modal, Radio, Select } from 'antd'
import { ApiError } from '../../shared/api/http'
import { reportIssue } from './api'

interface FormValues {
  issue_type: string
  description: string
  stops_productive_time: boolean
}

export default function ReportIssueModal({
  open,
  sessionId,
  onClose,
  onReported,
}: {
  open: boolean
  sessionId: number | null
  onClose: () => void
  onReported: () => void
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

  if (!sessionId) return null

  const handleSubmit = async (values: FormValues) => {
    setError(null)
    setSubmitting(true)
    try {
      await reportIssue({ session: sessionId, ...values })
      onReported()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not report this issue.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title="Report Work Centre Issue"
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={submitting}
      okText="Report"
      destroyOnHidden
    >
      {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}
      <Form<FormValues>
        form={form}
        layout="vertical"
        initialValues={{ stops_productive_time: true }}
        onFinish={(values) => void handleSubmit(values)}
      >
        <Form.Item
          label="Issue Type"
          name="issue_type"
          rules={[{ required: true, message: 'Select an issue type.' }]}
        >
          <Select
            options={[
              { value: 'MACHINE', label: 'Machine' },
              { value: 'MATERIAL', label: 'Material' },
              { value: 'QUALITY', label: 'Quality' },
              { value: 'OTHER', label: 'Other' },
            ]}
          />
        </Form.Item>
        <Form.Item label="Description" name="description">
          <Input.TextArea rows={2} placeholder="e.g. Sealer not heating" />
        </Form.Item>
        <Form.Item label="Stop productive time?" name="stops_productive_time">
          <Radio.Group
            options={[
              { value: true, label: 'Yes' },
              { value: false, label: 'No' },
            ]}
          />
        </Form.Item>
      </Form>
    </Modal>
  )
}
