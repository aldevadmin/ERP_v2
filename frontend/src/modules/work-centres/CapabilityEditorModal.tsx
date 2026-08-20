import { useEffect, useState } from 'react'
import { Form, InputNumber, Modal, Select } from 'antd'
import { listProcesses } from '../processes/api'
import type { Process } from '../processes/types'
import type { WorkCentreCapability, WorkCentreCapabilityFormValues } from './types'

export default function CapabilityEditorModal({
  open,
  capability,
  onClose,
  onSave,
}: {
  open: boolean
  capability: WorkCentreCapability | null
  onClose: () => void
  onSave: (values: WorkCentreCapabilityFormValues) => Promise<void>
}) {
  const [form] = Form.useForm<WorkCentreCapabilityFormValues>()
  const [processes, setProcesses] = useState<Process[]>([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    listProcesses({ isActive: true }).then((response) => setProcesses(response.results))
  }, [open])

  useEffect(() => {
    if (!open) return
    if (capability) {
      form.setFieldsValue({
        process_definition: capability.process_definition,
        standard_rate: capability.standard_rate,
      })
    } else {
      form.resetFields()
    }
  }, [open, capability, form])

  const handleSubmit = async (values: WorkCentreCapabilityFormValues) => {
    setSubmitting(true)
    try {
      await onSave({ ...values, id: capability?.id })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title={capability ? 'Edit Capability' : 'Add Capability'}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={submitting}
      okText={capability ? 'Save' : 'Add'}
      cancelText="Cancel"
      destroyOnHidden
    >
      <Form<WorkCentreCapabilityFormValues> form={form} layout="vertical" onFinish={handleSubmit}>
        <Form.Item
          label="Process"
          name="process_definition"
          rules={[{ required: true, message: 'Select a process.' }]}
        >
          <Select
            options={processes.map((p) => ({ value: p.id, label: `${p.name} (${p.code})` }))}
            showSearch
            optionFilterProp="label"
            placeholder="Search and select process"
          />
        </Form.Item>
        <Form.Item label="Standard Rate (units / hour, optional)" name="standard_rate">
          <InputNumber style={{ width: '100%' }} min={0} />
        </Form.Item>
      </Form>
    </Modal>
  )
}
