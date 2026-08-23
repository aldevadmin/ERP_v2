import { useEffect, useState } from 'react'
import { InfoCircleOutlined } from '@ant-design/icons'
import { DatePicker, Form, Input, InputNumber, Modal, Select } from 'antd'
import dayjs from 'dayjs'
import { listItems } from '../items/api'
import type { Item } from '../items/types'
import { listTooling } from './api'
import type { Tooling, ToolingAssignmentFormValues, WorkCentrePosition } from './types'

interface FormShape {
  tooling: number
  default_item: number | null
  standard_rate_override: number | null
  effective_from: dayjs.Dayjs
  notes: string
}

export default function ChangeToolingModal({
  open,
  position,
  onClose,
  onSave,
}: {
  open: boolean
  position: WorkCentrePosition | null
  onClose: () => void
  onSave: (values: ToolingAssignmentFormValues) => Promise<void>
}) {
  const [form] = Form.useForm<FormShape>()
  const [toolingOptions, setToolingOptions] = useState<Tooling[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [selectedTooling, setSelectedTooling] = useState<Tooling | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    listTooling({ isActive: true }).then((response) => setToolingOptions(response.results))
    listItems({ isActive: true }).then((response) =>
      setItems(response.results.filter((i) => i.item_class === 'WIP' || i.item_class === 'FINISHED_GOOD')),
    )
  }, [open])

  useEffect(() => {
    if (!open) return
    form.resetFields()
    setSelectedTooling(null)
    form.setFieldsValue({ effective_from: dayjs() })
  }, [open, position, form])

  const compatibleItemIds = new Set((selectedTooling?.compatibilities ?? []).map((c) => c.item))
  const itemOptions =
    compatibleItemIds.size > 0 ? items.filter((i) => compatibleItemIds.has(i.id)) : items

  const handleToolingChange = (toolingId: number) => {
    const tooling = toolingOptions.find((t) => t.id === toolingId) ?? null
    setSelectedTooling(tooling)
    form.setFieldsValue({
      default_item: undefined,
      standard_rate_override: tooling?.default_standard_rate ?? null,
    })
  }

  const handleSubmit = async (values: FormShape) => {
    setSubmitting(true)
    try {
      await onSave({
        tooling: values.tooling,
        default_item: values.default_item ?? null,
        standard_rate_override: values.standard_rate_override ?? null,
        effective_from: values.effective_from.toISOString(),
        notes: values.notes ?? '',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title={`Change Tooling — Position ${position?.position_index ?? ''}`}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={submitting}
      okText="Confirm Changeover"
      cancelText="Cancel"
      mask={{ closable: false }}
      destroyOnHidden
    >
      {position?.installed_tooling && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: '#8c8c8c' }}>Current Tooling</div>
          <div>
            {position.installed_tooling_code} • {position.installed_tooling}
          </div>
        </div>
      )}
      <Form<FormShape> form={form} layout="vertical" onFinish={handleSubmit}>
        <Form.Item
          label="New Tooling"
          name="tooling"
          rules={[{ required: true, message: 'Select tooling.' }]}
        >
          <Select
            options={toolingOptions.map((t) => ({ value: t.id, label: `${t.name} (${t.code})` }))}
            showSearch
            optionFilterProp="label"
            placeholder="Search compatible tooling"
            onChange={handleToolingChange}
          />
        </Form.Item>
        <Form.Item label="Default SKU for this assignment (optional)" name="default_item">
          <Select
            options={itemOptions.map((i) => ({ value: i.id, label: `${i.name} (${i.code})` }))}
            showSearch
            optionFilterProp="label"
            allowClear
          />
        </Form.Item>
        <Form.Item
          label="Standard Output / Hour (optional)"
          name="standard_rate_override"
          tooltip={{
            title: 'Overrides the tooling’s default output rate for this assignment only. Leave blank to use the tooling’s default rate.',
            icon: <InfoCircleOutlined />,
          }}
        >
          <InputNumber style={{ width: '100%' }} min={0} />
        </Form.Item>
        <Form.Item
          label="Effective From"
          name="effective_from"
          rules={[{ required: true, message: 'Select an effective date/time.' }]}
          tooltip={{
            title:
              'When this change takes effect. The previous tooling assignment on this position, if any, closes automatically at this same date/time.',
            icon: <InfoCircleOutlined />,
          }}
        >
          <DatePicker showTime style={{ width: '100%' }} format="DD MMM YYYY HH:mm" />
        </Form.Item>
        <Form.Item label="Reason / Notes (optional)" name="notes">
          <Input.TextArea rows={2} placeholder="Changeover for production plan" />
        </Form.Item>
      </Form>
    </Modal>
  )
}
