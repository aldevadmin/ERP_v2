import { useEffect, useState } from 'react'
import { InfoCircleOutlined } from '@ant-design/icons'
import { Form, Modal, Radio, Select, Switch } from 'antd'
import { listItems } from '../items/api'
import type { Item } from '../items/types'
import { INPUT_TYPE_OPTIONS, QUANTITY_CAPTURE_OPTIONS } from './types'
import type { InputType, ProcessInput, ProcessInputFormValues } from './types'

interface ItemOption {
  value: number
  label: string
  unit: string
}

function itemOptions(items: Item[]): ItemOption[] {
  return items.map((i) => ({
    value: i.id,
    label: `${i.name} (${i.code})`,
    unit: i.inventory_uom_code,
  }))
}

export default function InputEditorModal({
  open,
  input,
  onClose,
  onSave,
}: {
  open: boolean
  input: ProcessInput | null
  onClose: () => void
  onSave: (values: ProcessInputFormValues) => Promise<void>
}) {
  const [form] = Form.useForm<ProcessInputFormValues>()
  const [inputType, setInputType] = useState<InputType>('MATERIAL')
  const [materialItems, setMaterialItems] = useState<Item[]>([])
  const [wipItems, setWipItems] = useState<Item[]>([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    listItems({ isActive: true }).then((response) =>
      setMaterialItems(
        response.results.filter((i) => i.item_class !== 'WIP' && i.item_class !== 'FINISHED_GOOD'),
      ),
    )
    listItems({ isActive: true, itemClass: 'WIP' }).then((response) => setWipItems(response.results))
  }, [open])

  useEffect(() => {
    if (!open) return
    if (input) {
      setInputType(input.input_type)
      form.setFieldsValue({
        input_type: input.input_type,
        item: input.item_id,
        uom: input.uom,
        quantity_capture: input.quantity_capture,
        is_required: input.is_required,
      })
    } else {
      setInputType('MATERIAL')
      form.resetFields()
      form.setFieldsValue({ input_type: 'MATERIAL', quantity_capture: 'MANUAL', is_required: true })
    }
  }, [open, input, form])

  const options: ItemOption[] =
    inputType === 'WIP' ? itemOptions(wipItems) : itemOptions(materialItems)

  const handleItemChange = (itemId: number) => {
    const option = options.find((o) => o.value === itemId)
    if (option) {
      form.setFieldValue('uom', option.unit)
    }
  }

  const handleInputTypeChange = (value: InputType) => {
    setInputType(value)
    form.setFieldsValue({ item: undefined, uom: '' })
  }

  const handleSubmit = async (values: ProcessInputFormValues) => {
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
      <Form<ProcessInputFormValues> form={form} layout="vertical" onFinish={handleSubmit}>
        <Form.Item
          label="Input Type"
          name="input_type"
          rules={[{ required: true, message: 'Select an input type.' }]}
          tooltip={{
            title:
              'Determines which list this item is picked from. Material/Packaging/Other pull from the Item catalog. WIP pulls from WIP items carried over from an earlier process step.',
            icon: <InfoCircleOutlined />,
          }}
        >
          <Select
            options={INPUT_TYPE_OPTIONS}
            onChange={(value: InputType) => handleInputTypeChange(value)}
          />
        </Form.Item>
        <Form.Item label="Item" name="item" rules={[{ required: true, message: 'Select an item.' }]}>
          <Select
            options={options}
            showSearch
            optionFilterProp="label"
            placeholder="Search and select item"
            onChange={handleItemChange}
          />
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
          label="Quantity capture"
          name="quantity_capture"
          rules={[{ required: true, message: 'Select a quantity capture mode.' }]}
          tooltip={{
            title:
              'How much of this input gets recorded. Manual: the operator enters it. Formula: calculated automatically from other values. Optional: can be left blank.',
            icon: <InfoCircleOutlined />,
          }}
        >
          <Radio.Group options={QUANTITY_CAPTURE_OPTIONS} />
        </Form.Item>
        <Form.Item
          label="Is this input mandatory for execution?"
          name="is_required"
          valuePropName="checked"
          tooltip={{
            title: 'If off, this input can be skipped without blocking the process from completing.',
            icon: <InfoCircleOutlined />,
          }}
        >
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  )
}
