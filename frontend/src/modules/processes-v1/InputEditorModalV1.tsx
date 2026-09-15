import { useEffect, useState } from 'react'
import { Form, Input, Modal, Select, Switch } from 'antd'
import { listItemGroups } from '../items/api'
import type { ItemGroup } from '../items/types'
import type { ProcessInputV1, ProcessInputV1FormValues } from './types'

export default function InputEditorModalV1({
  open,
  input,
  onClose,
  onSave,
}: {
  open: boolean
  input: ProcessInputV1 | null
  onClose: () => void
  onSave: (values: ProcessInputV1FormValues) => Promise<void>
}) {
  const [form] = Form.useForm<ProcessInputV1FormValues>()
  const [itemGroups, setItemGroups] = useState<ItemGroup[]>([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    listItemGroups({ isActive: true }).then((response) => setItemGroups(response.results))
  }, [open])

  useEffect(() => {
    if (!open) return
    if (input) {
      form.setFieldsValue({
        item_group: input.item_group,
        uom: input.uom,
        is_required: input.is_required,
      })
    } else {
      form.resetFields()
      form.setFieldsValue({ is_required: true })
    }
  }, [open, input, form])

  const handleSubmit = async (values: ProcessInputV1FormValues) => {
    setSubmitting(true)
    try {
      await onSave({ ...values, id: input?.id })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title={input ? 'Edit Input' : 'Add Input'}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={submitting}
      okText={input ? 'Save' : 'Add Input'}
      cancelText="Cancel"
      mask={{ closable: false }}
      destroyOnHidden
    >
      <Form<ProcessInputV1FormValues> form={form} layout="vertical" onFinish={handleSubmit}>
        <Form.Item
          label="Item Group"
          name="item_group"
          tooltip="A free-form tag for items interchangeable at this role/stage — e.g. 'WIP – Unsorted Plate – Areca Palm'. Any item tagged with this group can flow through this slot, no matter its size."
          rules={[{ required: true, message: 'Select an Item Group.' }]}
        >
          <Select
            options={itemGroups.map((g) => ({ value: g.id, label: g.name }))}
            showSearch
            optionFilterProp="label"
            placeholder="Search and select an Item Group"
          />
        </Form.Item>
        <Form.Item label="UOM" name="uom" rules={[{ required: true, message: 'Enter a UOM.' }]}>
          <Input placeholder="e.g. PC, KG, POUCH" />
        </Form.Item>
        <Form.Item
          label="Is this input mandatory for execution?"
          name="is_required"
          valuePropName="checked"
        >
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  )
}
