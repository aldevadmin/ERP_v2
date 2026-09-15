import { useEffect, useState } from 'react'
import { Form, Input, Modal, Select, Switch } from 'antd'
import { listItemGroups } from '../items/api'
import type { ItemGroup } from '../items/types'
import { listOutputClassifications } from '../processes/api'
import type { OutputClassification } from '../processes/types'
import type { ProcessOutputV1, ProcessOutputV1FormValues } from './types'

export default function OutputEditorModalV1({
  open,
  output,
  onClose,
  onSave,
}: {
  open: boolean
  output: ProcessOutputV1 | null
  onClose: () => void
  onSave: (values: ProcessOutputV1FormValues) => Promise<void>
}) {
  const [form] = Form.useForm<ProcessOutputV1FormValues>()
  const [itemGroups, setItemGroups] = useState<ItemGroup[]>([])
  const [classifications, setClassifications] = useState<OutputClassification[]>([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    listItemGroups({ isActive: true }).then((response) => setItemGroups(response.results))
    listOutputClassifications({ isActive: true }).then((response) =>
      setClassifications(response.results),
    )
  }, [open])

  useEffect(() => {
    if (!open) return
    if (output) {
      form.setFieldsValue({
        item_group: output.item_group,
        classification: output.classification,
        uom: output.uom,
        can_move_forward: output.can_move_forward,
        creates_traceable_output: output.creates_traceable_output,
      })
    } else {
      form.resetFields()
      form.setFieldsValue({ can_move_forward: true, creates_traceable_output: true })
    }
  }, [open, output, form])

  const handleSubmit = async (values: ProcessOutputV1FormValues) => {
    setSubmitting(true)
    try {
      await onSave({ ...values, id: output?.id })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title={output ? 'Edit Output' : 'Add Output'}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={submitting}
      okText={output ? 'Save' : 'Add Output'}
      cancelText="Cancel"
      mask={{ closable: false }}
      destroyOnHidden
    >
      <Form<ProcessOutputV1FormValues> form={form} layout="vertical" onFinish={handleSubmit}>
        <Form.Item
          label="Item Group"
          name="item_group"
          tooltip="A free-form tag for items interchangeable at this role/stage. A branching process (e.g. Good/Standard/Reject) gets one Output row per group — each with its own Item Group here."
          rules={[{ required: true, message: 'Select an Item Group.' }]}
        >
          <Select
            options={itemGroups.map((g) => ({ value: g.id, label: g.name }))}
            showSearch
            optionFilterProp="label"
            placeholder="Search and select an Item Group"
          />
        </Form.Item>
        <Form.Item
          label="Classification (optional)"
          name="classification"
          tooltip="Good, Standard, Reject... — the standardized cross-cutting grade, useful for reporting across processes regardless of Item Group."
        >
          <Select
            allowClear
            options={classifications.map((c) => ({ value: c.id, label: c.name }))}
            showSearch
            optionFilterProp="label"
          />
        </Form.Item>
        <Form.Item label="UOM" name="uom" rules={[{ required: true, message: 'Enter a UOM.' }]}>
          <Input placeholder="e.g. PC, KG, POUCH" />
        </Form.Item>
        <Form.Item
          label="Can this output move to another process?"
          name="can_move_forward"
          valuePropName="checked"
        >
          <Switch />
        </Form.Item>
        <Form.Item
          label="Create traceable output record?"
          name="creates_traceable_output"
          valuePropName="checked"
        >
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  )
}
