import { useEffect, useState } from 'react'
import { Alert, Form, Input, InputNumber, Modal } from 'antd'
import { ApiError } from '../../shared/api/http'
import { createShipmentLine } from './api'
import type { ExportOrderLine } from './types'

interface FormValues {
  planned_qty: number
  remarks?: string
}

export default function AddToShipmentModal({
  open,
  exportOrderId,
  shipmentId,
  orderLine,
  onClose,
  onCreated,
}: {
  open: boolean
  exportOrderId: number
  shipmentId: number
  /** The order line being allocated — not yet on this shipment. */
  orderLine: ExportOrderLine | null
  onClose: () => void
  onCreated: () => void
}) {
  const [form] = Form.useForm<FormValues>()
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if (open && orderLine) {
      form.resetFields()
      setFormError(null)
      // Defaults to the SKU's full requirement — if some of it is already
      // planned on another shipment, the backend rejects with a clear
      // "only N still unallocated" error (business-rules.md §7), surfaced
      // below rather than pre-computed here.
      form.setFieldsValue({ planned_qty: orderLine.required_pieces })
    }
  }, [open, orderLine, form])

  const handleSubmit = async (values: FormValues) => {
    if (orderLine === null) return
    setSubmitting(true)
    setFormError(null)
    try {
      await createShipmentLine(exportOrderId, shipmentId, {
        export_order_line: orderLine.id,
        planned_qty: values.planned_qty,
        remarks: values.remarks || '',
      })
      onCreated()
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : 'Could not add this SKU to the shipment.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title={orderLine ? `Add to Shipment — ${orderLine.customer_sku_code}` : 'Add to Shipment'}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={submitting}
      okText="Add to Shipment"
      cancelText="Cancel"
      destroyOnHidden
    >
      {orderLine && (
        <>
          {formError && (
            <Alert type="error" title={formError} showIcon style={{ marginBottom: 16 }} />
          )}
          <Form<FormValues> form={form} layout="vertical" onFinish={handleSubmit}>
            <Form.Item
              label="Planned Qty (pieces)"
              name="planned_qty"
              rules={[{ required: true, message: 'Enter the planned quantity.' }]}
            >
              <InputNumber aria-label="Planned Qty (pieces)" min={1} style={{ width: '100%' }} />
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
