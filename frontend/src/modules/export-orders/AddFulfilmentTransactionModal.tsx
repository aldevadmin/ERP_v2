import { useEffect, useState } from 'react'
import { Alert, DatePicker, Form, Input, InputNumber, Modal, Select, Typography } from 'antd'
import { InfoCircleOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { ApiError } from '../../shared/api/http'
import { listVendors } from '../vendors/api'
import { createProcurementTransaction, createProductionTransaction } from './api'
import type { FulfilmentSource } from './types'

const { Text } = Typography

const SOURCE_OPTIONS: { value: FulfilmentSource; label: string }[] = [
  { value: 'PRODUCTION', label: 'Production' },
  { value: 'PROCUREMENT', label: 'Procurement' },
]

interface FormValues {
  export_order_line: number
  source: FulfilmentSource
  // AntD `Select mode="tags"` always yields an array — capped to one
  // entry (`maxCount`) since `party_team` is a single free-text value,
  // not a real multi-value field.
  party_team: string[]
  date: Dayjs
  quantity: number
  quantity_accepted: number
  quantity_rejected: number
  remarks?: string
}

export default function AddFulfilmentTransactionModal({
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
  const [partyTeamOptions, setPartyTeamOptions] = useState<{ value: string; label: string }[]>([])

  useEffect(() => {
    listVendors().then((response) =>
      setPartyTeamOptions(response.results.map((v) => ({ value: v.name, label: v.name }))),
    )
  }, [])

  useEffect(() => {
    if (open) {
      form.resetFields()
      setFormError(null)
      form.setFieldsValue({
        source: 'PRODUCTION',
        date: dayjs(),
        export_order_line: prefillSku,
        quantity_rejected: 0,
      })
    }
  }, [open, prefillSku, form])

  const handleSubmit = async (values: FormValues) => {
    setSubmitting(true)
    setFormError(null)
    try {
      const date = values.date.format('YYYY-MM-DD')
      const partyTeam = values.party_team[0] ?? ''
      if (values.source === 'PRODUCTION') {
        await createProductionTransaction(exportOrderId, values.export_order_line, {
          date,
          quantity_produced: values.quantity,
          quantity_accepted: values.quantity_accepted,
          quantity_rejected: values.quantity_rejected ?? 0,
          party_team: partyTeam,
          remarks: values.remarks || '',
        })
      } else {
        await createProcurementTransaction(exportOrderId, values.export_order_line, {
          date,
          quantity_received: values.quantity,
          quantity_accepted: values.quantity_accepted,
          quantity_rejected: values.quantity_rejected ?? 0,
          party_team: partyTeam,
          remarks: values.remarks || '',
        })
      }
      onCreated()
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not save this transaction.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title="Add Fulfilment Transaction"
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={submitting}
      okText="Add Transaction"
      cancelText="Cancel"
      destroyOnHidden
    >
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
        <Form.Item label="Source" name="source" rules={[{ required: true }]}>
          <Select aria-label="Source" options={SOURCE_OPTIONS} />
        </Form.Item>
        <Form.Item
          label="Party / Team"
          name="party_team"
          rules={[{ required: true, message: 'Enter or select a party / team.' }]}
        >
          <Select
            aria-label="Party / Team"
            mode="tags"
            maxCount={1}
            placeholder="Select or enter party / team"
            options={partyTeamOptions}
            showSearch
          />
        </Form.Item>
        <Form.Item
          label="Transaction Date"
          name="date"
          rules={[{ required: true, message: 'Select a date.' }]}
        >
          <DatePicker aria-label="Transaction Date" style={{ width: '100%' }} format="YYYY-MM-DD" />
        </Form.Item>
        <Form.Item
          label="Received or Produced Qty"
          name="quantity"
          rules={[{ required: true, message: 'Enter the quantity.' }]}
        >
          <InputNumber
            aria-label="Received or Produced Qty"
            min={0}
            style={{ width: '100%' }}
            suffix="pcs"
          />
        </Form.Item>
        <Form.Item
          label="Accepted Qty"
          name="quantity_accepted"
          rules={[{ required: true, message: 'Enter the accepted quantity.' }]}
        >
          <InputNumber aria-label="Accepted Qty" min={0} style={{ width: '100%' }} suffix="pcs" />
        </Form.Item>
        <Form.Item label="Rejected Qty" name="quantity_rejected">
          <InputNumber aria-label="Rejected Qty" min={0} style={{ width: '100%' }} suffix="pcs" />
        </Form.Item>
        <Form.Item label="Unit">
          <Input value="pcs" disabled />
        </Form.Item>
        <Form.Item label="Remarks" name="remarks">
          <Input.TextArea rows={2} placeholder="Enter remarks (optional)" />
        </Form.Item>
      </Form>
      <Text type="secondary" style={{ fontSize: 12 }}>
        <InfoCircleOutlined /> Readiness is driven by accepted quantity only.
      </Text>
    </Modal>
  )
}
