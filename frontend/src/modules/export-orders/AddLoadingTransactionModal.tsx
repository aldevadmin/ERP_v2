import { useEffect, useState } from 'react'
import { Alert, DatePicker, Form, Input, InputNumber, Modal, Select, Typography } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { ApiError } from '../../shared/api/http'
import { createLoadingTransaction } from './api'
import type { LoadingEntryType, ShipmentLine, VarianceReason } from './types'
import { VARIANCE_REASON_OPTIONS } from './types'

const { Text } = Typography

interface FormValues {
  date: Dayjs
  cartons_loaded: number | null
  pouches_loaded: number | null
  variance_reason?: VarianceReason | ''
  remarks?: string
}

function exactlyOneQuantityValidator(getSibling: () => number | null | undefined) {
  return async (_: unknown, value: number | null) => {
    const sibling = getSibling()
    if (!value && !sibling) throw new Error('Enter cartons or pouches loaded.')
    if (value && sibling) throw new Error('Enter cartons OR pouches, not both.')
  }
}

export default function AddLoadingTransactionModal({
  open,
  exportOrderId,
  shipmentId,
  shipmentLine,
  onClose,
  onCreated,
}: {
  open: boolean
  exportOrderId: number
  shipmentId: number
  shipmentLine: ShipmentLine | null
  onClose: () => void
  onCreated: () => void
}) {
  const [form] = Form.useForm<FormValues>()
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      form.resetFields()
      setFormError(null)
      form.setFieldsValue({ date: dayjs() })
    }
  }, [open, form])

  const handleSubmit = async (values: FormValues) => {
    if (shipmentLine === null) return
    setSubmitting(true)
    setFormError(null)
    try {
      const entryType: LoadingEntryType = values.cartons_loaded
        ? 'CARTON_LOADED'
        : 'POUCH_LOADED'
      await createLoadingTransaction(exportOrderId, shipmentId, shipmentLine.id, {
        date: values.date.format('YYYY-MM-DD'),
        entry_type: entryType,
        cartons_loaded: values.cartons_loaded || null,
        pouches_loaded: values.pouches_loaded || null,
        variance_reason: values.variance_reason || undefined,
        remarks: values.remarks || '',
      })
      onCreated()
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not save this entry.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title={shipmentLine ? `Update Loading — ${shipmentLine.customer_sku_code}` : 'Update Loading'}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={submitting}
      okText="Save"
      cancelText="Cancel"
      destroyOnHidden
    >
      {shipmentLine && (
        <>
          {formError && (
            <Alert type="error" title={formError} showIcon style={{ marginBottom: 16 }} />
          )}
          <Form<FormValues> form={form} layout="vertical" onFinish={handleSubmit}>
            <Form.Item label="Loadable Qty (Cartons)">
              <InputNumber value={shipmentLine.planned_cartons ?? undefined} disabled style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              label="Packing Date"
              name="date"
              rules={[{ required: true, message: 'Select a date.' }]}
            >
              <DatePicker aria-label="Loading Date" style={{ width: '100%' }} format="YYYY-MM-DD" />
            </Form.Item>
            <Form.Item
              label="Cartons Loaded Now"
              name="cartons_loaded"
              dependencies={['pouches_loaded']}
              rules={[
                { validator: exactlyOneQuantityValidator(() => form.getFieldValue('pouches_loaded')) },
              ]}
            >
              <InputNumber
                aria-label="Cartons Loaded Now"
                min={0}
                style={{ width: '100%' }}
                suffix="cartons"
              />
            </Form.Item>
            <Form.Item
              label="Pouches Loaded Now"
              name="pouches_loaded"
              dependencies={['cartons_loaded']}
              rules={[
                { validator: exactlyOneQuantityValidator(() => form.getFieldValue('cartons_loaded')) },
              ]}
            >
              <InputNumber
                aria-label="Pouches Loaded Now"
                min={0}
                style={{ width: '100%' }}
                suffix="pouches"
              />
            </Form.Item>
            <Form.Item label="Pieces Loaded (Auto)">
              <Input aria-label="Pieces Loaded (Auto)" value="0" disabled />
              <Text type="secondary" style={{ fontSize: 12 }}>
                Auto-calculated from cartons and pouches configuration.
              </Text>
            </Form.Item>
            <Form.Item label="Net Weight (Auto, kg)" help="Recalculates after you save.">
              <InputNumber value={shipmentLine.net_weight_kg ?? undefined} disabled style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="Gross Weight (Auto, kg)" help="Recalculates after you save.">
              <InputNumber value={shipmentLine.gross_weight_kg ?? undefined} disabled style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="Reason" name="variance_reason">
              <Select
                aria-label="Reason"
                placeholder="Select reason (if the loaded total won't match the loadable quantity)"
                allowClear
                options={VARIANCE_REASON_OPTIONS}
              />
            </Form.Item>
            <Form.Item label="Remarks (optional)" name="remarks">
              <Input.TextArea rows={2} />
            </Form.Item>
          </Form>
        </>
      )}
    </Modal>
  )
}
