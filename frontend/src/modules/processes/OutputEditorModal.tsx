import { useEffect, useState } from 'react'
import { InfoCircleOutlined } from '@ant-design/icons'
import { Form, Input, Modal, Radio, Select } from 'antd'
import { listItems } from '../items/api'
import type { Item } from '../items/types'
import { listOutputClassifications } from './api'
import type { OutputClassification, OutputItemType, ProcessOutput, ProcessOutputFormValues } from './types'

interface ItemOption {
  value: number
  label: string
  unit: string
  item_type: OutputItemType
}

function toItemOption(item: Item): ItemOption {
  return {
    value: item.id,
    label: `${item.name} (${item.code})`,
    unit: item.inventory_uom_code,
    item_type: item.item_class === 'WIP' || item.item_class === 'FINISHED_GOOD' ? 'PRODUCT' : 'MATERIAL',
  }
}

export default function OutputEditorModal({
  open,
  output,
  onClose,
  onSave,
}: {
  open: boolean
  output: ProcessOutput | null
  onClose: () => void
  onSave: (values: ProcessOutputFormValues) => Promise<void>
}) {
  const [form] = Form.useForm<ProcessOutputFormValues>()
  const [items, setItems] = useState<Item[]>([])
  const [classifications, setClassifications] = useState<OutputClassification[]>([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    listItems({ isActive: true }).then((response) => setItems(response.results))
    listOutputClassifications({ isActive: true }).then((response) =>
      setClassifications(response.results),
    )
  }, [open])

  useEffect(() => {
    if (!open) return
    if (output) {
      form.setFieldsValue({
        item_type: output.item_type,
        item: output.item_id,
        uom: output.uom,
        classification: output.classification,
        can_move_forward: output.can_move_forward,
        creates_traceable_output: output.creates_traceable_output,
        default_storage_destination: output.default_storage_destination,
      })
    } else {
      form.resetFields()
      form.setFieldsValue({
        can_move_forward: true,
        creates_traceable_output: true,
        default_storage_destination: '',
      })
    }
  }, [open, output, form])

  // Output Item searches the whole Item catalog — unlike Step 2's Input
  // Type, there's no separate user-facing "item type" selector here;
  // `item_type` is derived from the chosen item's class.
  const options: ItemOption[] = items.map(toItemOption)

  const handleItemChange = (itemId: number) => {
    const option = options.find((o) => o.value === itemId)
    if (option) {
      form.setFieldsValue({ item_type: option.item_type, uom: option.unit })
    }
  }

  const handleSubmit = async (values: ProcessOutputFormValues) => {
    setSubmitting(true)
    try {
      await onSave({ ...values, id: output?.id })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title={output ? 'Edit Output' : 'Configure Output'}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={submitting}
      okText={output ? 'Save' : 'Save'}
      cancelText="Cancel"
      mask={{ closable: false }}
      destroyOnHidden
    >
      <Form<ProcessOutputFormValues> form={form} layout="vertical" onFinish={handleSubmit}>
        <Form.Item
          label="Output Item"
          name="item"
          rules={[{ required: true, message: 'Select an output item.' }]}
        >
          <Select
            options={options}
            showSearch
            optionFilterProp="label"
            placeholder="Search and select item"
            onChange={handleItemChange}
          />
        </Form.Item>
        <Form.Item name="item_type" hidden>
          <Input />
        </Form.Item>
        <Form.Item label="UOM" name="uom" rules={[{ required: true, message: 'Enter a UOM.' }]}>
          <Select
            options={[...new Set(options.map((o) => o.unit))].map((unit) => ({
              value: unit,
              label: unit,
            }))}
            showSearch
          />
        </Form.Item>
        <Form.Item
          label="Classification"
          name="classification"
          rules={[{ required: true, message: 'Select a classification.' }]}
          tooltip={{
            title:
              'Groups this output by grade or type, e.g. Premium / Standard / Reject. Used later in Product Routes to send each grade down a different path — e.g. Premium to Packing, Reject to Storage.',
            icon: <InfoCircleOutlined />,
          }}
        >
          <Select
            options={classifications.map((c) => ({ value: c.id, label: c.name }))}
            showSearch
            optionFilterProp="label"
          />
        </Form.Item>
        <Form.Item
          label="Can this output move to another process / location?"
          name="can_move_forward"
          tooltip={{
            title:
              'Yes: this output can be routed onward, either to another process or into storage. No: it is a final output that stays here, e.g. scrap or waste.',
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
        <Form.Item
          label="Create traceable output record?"
          name="creates_traceable_output"
          tooltip={{
            title:
              'Yes: this output is tracked as its own record (e.g. a batch/lot you can trace later). Turn off for by-products that don’t need individual tracking.',
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
        <Form.Item
          label="Default storage destination (optional)"
          name="default_storage_destination"
          tooltip={{
            title:
              'A suggested location shown as a hint only. The actual destination for this output is configured per product in Product Routes’ Output Routing step.',
            icon: <InfoCircleOutlined />,
          }}
        >
          <Input />
        </Form.Item>
      </Form>
    </Modal>
  )
}
