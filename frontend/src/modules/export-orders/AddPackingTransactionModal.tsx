import { useEffect, useState } from 'react'
import { Alert, DatePicker, Form, Input, InputNumber, Modal, Select, Typography } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { ApiError } from '../../shared/api/http'
import { listEmployees, listTeams } from '../accounts/api'
import { createPackingTransaction } from './api'
import type { PackingEntryType } from './types'

const { Text } = Typography

interface FormValues {
  export_order_line: number
  pouches_packed: number | null
  cartons_packed: number | null
  packed_by: number
  // AntD `Select mode="tags"` always yields an array — capped to one entry
  // (`maxCount`) since `shift_team` is a single free-text value, not a
  // real multi-value field. Optional, unlike Fulfilment's `party_team`.
  shift_team: string[]
  date: Dayjs
  remarks?: string
}

function exactlyOneQuantityValidator(getSibling: () => number | null | undefined) {
  return async (_: unknown, value: number | null) => {
    const sibling = getSibling()
    if (!value && !sibling) throw new Error('Enter pouches or cartons packed.')
    if (value && sibling) throw new Error('Enter pouches OR cartons, not both.')
  }
}

export default function AddPackingTransactionModal({
  open,
  exportOrderId,
  skuOptions,
  prefillSku,
  onClose,
  onCreated,
}: {
  open: boolean
  exportOrderId: number
  skuOptions: { value: number; label: string }[]
  /** Locks the SKU field to this line — used when opened from a
   * readiness-table row's "Add Transaction" action, so the entry can't
   * accidentally land on the wrong SKU. */
  prefillSku?: number
  onClose: () => void
  onCreated: () => void
}) {
  const [form] = Form.useForm<FormValues>()
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [employeeOptions, setEmployeeOptions] = useState<{ value: number; label: string }[]>([])
  const [shiftTeamOptions, setShiftTeamOptions] = useState<{ value: string; label: string }[]>([])

  useEffect(() => {
    listEmployees().then((response) =>
      setEmployeeOptions(response.results.map((e) => ({ value: e.id, label: e.full_name }))),
    )
    listTeams().then((response) =>
      setShiftTeamOptions(response.results.map((t) => ({ value: t.name, label: t.name }))),
    )
  }, [])

  useEffect(() => {
    if (open) {
      form.resetFields()
      setFormError(null)
      form.setFieldsValue({
        date: dayjs(),
        export_order_line: prefillSku,
      })
    }
  }, [open, prefillSku, form])

  const handleSubmit = async (values: FormValues) => {
    setSubmitting(true)
    setFormError(null)
    try {
      const date = values.date.format('YYYY-MM-DD')
      const entryType: PackingEntryType = values.cartons_packed
        ? 'CARTON_COMPLETED'
        : 'POUCH_PACKED'
      await createPackingTransaction(exportOrderId, values.export_order_line, {
        date,
        entry_type: entryType,
        cartons_packed: values.cartons_packed || null,
        pouches_packed: values.pouches_packed || null,
        packed_by: values.packed_by,
        shift_team: values.shift_team?.[0] ?? '',
        remarks: values.remarks || '',
      })
      onCreated()
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not save this transaction.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title="Add Packing Transaction"
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={submitting}
      okText="Add Transaction"
      cancelText="Cancel"
      destroyOnHidden
    >
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        Record packing completed for a specific SKU.
      </Text>
      {formError && <Alert type="error" title={formError} showIcon style={{ marginBottom: 16 }} />}
      <Form<FormValues> form={form} layout="vertical" onFinish={handleSubmit}>
        <Form.Item
          label="SKU"
          name="export_order_line"
          rules={[{ required: true, message: 'Select a SKU.' }]}
        >
          <Select
            aria-label="SKU"
            placeholder="Select SKU"
            options={skuOptions}
            disabled={prefillSku !== undefined}
            showSearch
            optionFilterProp="label"
          />
        </Form.Item>
        <Form.Item
          label="Packing Date"
          name="date"
          rules={[{ required: true, message: 'Select a date.' }]}
        >
          <DatePicker aria-label="Packing Date" style={{ width: '100%' }} format="YYYY-MM-DD" />
        </Form.Item>
        <Form.Item
          label="Pouches Packed"
          name="pouches_packed"
          dependencies={['cartons_packed']}
          rules={[{ validator: exactlyOneQuantityValidator(() => form.getFieldValue('cartons_packed')) }]}
        >
          <InputNumber aria-label="Pouches Packed" min={0} style={{ width: '100%' }} suffix="pouches" />
        </Form.Item>
        <Form.Item
          label="Cartons Packed"
          name="cartons_packed"
          dependencies={['pouches_packed']}
          rules={[{ validator: exactlyOneQuantityValidator(() => form.getFieldValue('pouches_packed')) }]}
        >
          <InputNumber aria-label="Cartons Packed" min={0} style={{ width: '100%' }} suffix="cartons" />
        </Form.Item>
        <Form.Item label="Pieces Packed">
          <Input aria-label="Pieces Packed" value="0" disabled />
          <Text type="secondary" style={{ fontSize: 12 }}>
            Auto-calculated from pouches and cartons configuration.
          </Text>
        </Form.Item>
        <Form.Item
          label="Packed By"
          name="packed_by"
          rules={[{ required: true, message: 'Select who packed this.' }]}
        >
          <Select
            aria-label="Packed By"
            placeholder="Select user"
            options={employeeOptions}
            showSearch
            optionFilterProp="label"
          />
        </Form.Item>
        <Form.Item label="Shift / Team" name="shift_team">
          <Select
            aria-label="Shift / Team"
            mode="tags"
            maxCount={1}
            placeholder="Select or enter shift or team"
            options={shiftTeamOptions}
            showSearch
          />
        </Form.Item>
        <Form.Item label="Remarks" name="remarks">
          <Input.TextArea
            rows={2}
            placeholder="Enter any additional remarks (optional)"
            showCount
            maxLength={250}
          />
        </Form.Item>
      </Form>
    </Modal>
  )
}
