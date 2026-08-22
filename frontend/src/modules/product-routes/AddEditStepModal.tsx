import { useEffect, useState } from 'react'
import { InfoCircleOutlined } from '@ant-design/icons'
import { Form, Input, Modal, Radio, Select } from 'antd'
import { listProcesses } from '../processes/api'
import type { Process } from '../processes/types'
import type { RouteNode, RouteNodeFormValues } from './types'

export default function AddEditStepModal({
  open,
  node,
  onClose,
  onSave,
}: {
  open: boolean
  node: RouteNode | null
  onClose: () => void
  onSave: (values: RouteNodeFormValues) => Promise<void>
}) {
  const [form] = Form.useForm<RouteNodeFormValues>()
  const [processes, setProcesses] = useState<Process[]>([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    listProcesses({ isActive: true }).then((response) => setProcesses(response.results))
  }, [open])

  useEffect(() => {
    if (!open) return
    if (node) {
      form.setFieldsValue({
        process_definition: node.process_definition,
        display_label: node.display_label,
        is_optional: node.is_optional,
      })
    } else {
      form.resetFields()
      form.setFieldsValue({ display_label: '', is_optional: false })
    }
  }, [open, node, form])

  const handleSubmit = async (values: RouteNodeFormValues) => {
    setSubmitting(true)
    try {
      await onSave({ ...values, id: node?.id, node_key: node?.node_key })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title={node ? 'Edit Route Step' : 'Add Route Step'}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={submitting}
      okText={node ? 'Save' : 'Add Step'}
      cancelText="Cancel"
      mask={{ closable: false }}
      destroyOnHidden
    >
      <Form<RouteNodeFormValues> form={form} layout="vertical" onFinish={handleSubmit}>
        <Form.Item
          label="Process"
          name="process_definition"
          rules={[{ required: true, message: 'Select a process.' }]}
        >
          <Select
            options={processes.map((p) => ({ value: p.id, label: `${p.name} (${p.code})` }))}
            showSearch
            optionFilterProp="label"
            placeholder="Search and select a process"
          />
        </Form.Item>
        <Form.Item label="Step Label (optional)" name="display_label">
          <Input placeholder="e.g. Pressing - Main Line" />
        </Form.Item>
        <Form.Item
          label="Is this step optional in this route?"
          name="is_optional"
          tooltip={{
            title:
              'Yes: some units can skip this step, e.g. an optional rework pass. No: every unit following this route must pass through this step.',
            icon: <InfoCircleOutlined />,
          }}
        >
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
