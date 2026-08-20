import { useEffect, useState } from 'react'
import { Form, Input, Modal, Radio, Select } from 'antd'
import { listMaterials } from '../materials/api'
import type { Material } from '../materials/types'
import { listProducts } from '../products/api'
import type { Product } from '../products/types'
import { listOutputClassifications } from './api'
import type { OutputClassification, OutputItemType, ProcessOutput, ProcessOutputFormValues } from './types'

interface ItemOption {
  value: number
  label: string
  unit: string
  item_type: OutputItemType
}

function materialOptions(materials: Material[]): ItemOption[] {
  return materials.map((m) => ({
    value: m.id,
    label: `${m.name} (${m.code})`,
    unit: m.unit,
    item_type: 'MATERIAL',
  }))
}

function productOptions(products: Product[]): ItemOption[] {
  return products.map((p) => ({
    value: p.id,
    label: `${p.name} (${p.sku_code})`,
    unit: p.base_unit,
    item_type: 'PRODUCT',
  }))
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
  const [materials, setMaterials] = useState<Material[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [classifications, setClassifications] = useState<OutputClassification[]>([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    listMaterials({ isActive: true }).then((response) => setMaterials(response.results))
    listProducts({ isActive: true }).then((response) => setProducts(response.results))
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

  // Output Item searches Materials and Products together — unlike Step 2's
  // Input Type, there's no separate user-facing "item type" selector here;
  // `item_type` is derived from which master the chosen option came from.
  const options: ItemOption[] = [...materialOptions(materials), ...productOptions(products)]

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
        >
          <Radio.Group
            options={[
              { value: true, label: 'Yes' },
              { value: false, label: 'No' },
            ]}
          />
        </Form.Item>
        <Form.Item label="Create traceable output record?" name="creates_traceable_output">
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
        >
          <Input />
        </Form.Item>
      </Form>
    </Modal>
  )
}
