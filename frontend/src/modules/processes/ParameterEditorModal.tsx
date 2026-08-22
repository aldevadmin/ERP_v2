import { useEffect, useState } from 'react'
import { InfoCircleOutlined } from '@ant-design/icons'
import { Form, Input, Modal, Select, Switch } from 'antd'
import { PARAMETER_CAPTURE_AT_OPTIONS, PARAMETER_DATA_TYPE_OPTIONS } from './types'
import type { ProcessParameter, ProcessParameterFormValues } from './types'

function slugifyCode(label: string): string {
  return label
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export default function ParameterEditorModal({
  open,
  parameter,
  onClose,
  onSave,
}: {
  open: boolean
  parameter: ProcessParameter | null
  onClose: () => void
  onSave: (values: ProcessParameterFormValues) => Promise<void>
}) {
  const [form] = Form.useForm<ProcessParameterFormValues>()
  const [codeTouched, setCodeTouched] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    if (parameter) {
      setCodeTouched(true)
      form.setFieldsValue({
        label: parameter.label,
        code: parameter.code,
        data_type: parameter.data_type,
        unit: parameter.unit,
        capture_at: parameter.capture_at,
        is_required: parameter.is_required,
        default_value: parameter.default_value,
      })
    } else {
      setCodeTouched(false)
      form.resetFields()
      form.setFieldsValue({ is_required: true, unit: '', default_value: '' })
    }
  }, [open, parameter, form])

  const handleLabelChange = (value: string) => {
    if (!codeTouched) {
      form.setFieldValue('code', slugifyCode(value))
    }
  }

  const handleSubmit = async (values: ProcessParameterFormValues) => {
    setSubmitting(true)
    try {
      await onSave({ ...values, id: parameter?.id })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title={parameter ? 'Edit Parameter' : 'Add Parameter'}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={submitting}
      okText={parameter ? 'Save' : 'Add'}
      cancelText="Cancel"
      mask={{ closable: false }}
      destroyOnHidden
    >
      <Form<ProcessParameterFormValues> form={form} layout="vertical" onFinish={handleSubmit}>
        <Form.Item
          label="Label"
          name="label"
          rules={[{ required: true, message: 'Enter a label.' }]}
        >
          <Input onChange={(e) => handleLabelChange(e.target.value)} />
        </Form.Item>
        <Form.Item
          label="Code"
          name="code"
          rules={[{ required: true, message: 'Enter a code.' }]}
          extra="Auto-generated from Label; edit only if you need to."
        >
          <Input onChange={() => setCodeTouched(true)} />
        </Form.Item>
        <Form.Item
          label="Data Type"
          name="data_type"
          rules={[{ required: true, message: 'Select a data type.' }]}
          tooltip={{
            title: 'The kind of value this parameter captures — determines how it is entered and validated.',
            icon: <InfoCircleOutlined />,
          }}
        >
          <Select options={PARAMETER_DATA_TYPE_OPTIONS} />
        </Form.Item>
        <Form.Item label="Unit (optional)" name="unit">
          <Input placeholder="e.g. °C, Kg, %" />
        </Form.Item>
        <Form.Item
          label="Capture At"
          name="capture_at"
          rules={[{ required: true, message: 'Select when this is captured.' }]}
          tooltip={{
            title: 'When during the process step this value gets recorded — at Setup, Start, During, or Completion.',
            icon: <InfoCircleOutlined />,
          }}
        >
          <Select options={PARAMETER_CAPTURE_AT_OPTIONS} />
        </Form.Item>
        <Form.Item label="Required" name="is_required" valuePropName="checked">
          <Switch />
        </Form.Item>
        <Form.Item
          label="Default Value / Allowed Options"
          name="default_value"
          tooltip={{
            title:
              'For most types, a default value pre-filled when this parameter is captured. For Select, list the allowed choices separated by commas.',
            icon: <InfoCircleOutlined />,
          }}
        >
          <Input.TextArea rows={2} placeholder="e.g. a default, or comma-separated options" />
        </Form.Item>
      </Form>
    </Modal>
  )
}
