import { useEffect, useState } from 'react'
import { Form, Modal, Radio, Select, Switch } from 'antd'
import { listMaterials } from '../materials/api'
import type { Material } from '../materials/types'
import { listProducts } from '../products/api'
import type { Product } from '../products/types'
import { INPUT_TYPE_OPTIONS, QUANTITY_CAPTURE_OPTIONS } from './types'
import type { InputType, ProcessInput, ProcessInputFormValues } from './types'

interface ItemOption {
  value: number
  label: string
  unit: string
}

function materialOptions(materials: Material[]): ItemOption[] {
  return materials.map((m) => ({ value: m.id, label: `${m.name} (${m.code})`, unit: m.unit }))
}

function productOptions(products: Product[]): ItemOption[] {
  return products.map((p) => ({ value: p.id, label: `${p.name} (${p.sku_code})`, unit: p.base_unit }))
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
  const [materials, setMaterials] = useState<Material[]>([])
  const [semiFinishedProducts, setSemiFinishedProducts] = useState<Product[]>([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    listMaterials({ isActive: true }).then((response) => setMaterials(response.results))
    listProducts({ isActive: true, stage: 'SEMI_FINISHED' }).then((response) =>
      setSemiFinishedProducts(response.results),
    )
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
    inputType === 'WIP' ? productOptions(semiFinishedProducts) : materialOptions(materials)

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
      destroyOnHidden
    >
      <Form<ProcessInputFormValues> form={form} layout="vertical" onFinish={handleSubmit}>
        <Form.Item
          label="Input Type"
          name="input_type"
          rules={[{ required: true, message: 'Select an input type.' }]}
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
        >
          <Radio.Group options={QUANTITY_CAPTURE_OPTIONS} />
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
