import { useEffect, useState } from 'react'
import { Alert, Col, Form, Input, InputNumber, Modal, Row, Typography } from 'antd'
import dayjs from 'dayjs'
import { ApiError } from '../../shared/api/http'
import { createLoadingTransaction } from './api'
import type { ShipmentLine } from './types'

const { Text } = Typography

interface FormValues {
  cartons_loaded: number | null
  remarks?: string
}

function formatKg(value: number | null): string {
  return value === null ? '0.00 kg' : `${value.toFixed(2)} kg`
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
    }
  }, [open, form])

  const handleSubmit = async (values: FormValues) => {
    if (shipmentLine === null) return
    setSubmitting(true)
    setFormError(null)
    try {
      // Date & time are captured automatically (today's date, `created_at`
      // covers the precise timestamp) — no manual picker. This entry is
      // meant to be logged every 15-30 minutes as loading progresses, not
      // backfilled for an earlier day.
      await createLoadingTransaction(exportOrderId, shipmentId, shipmentLine.id, {
        date: dayjs().format('YYYY-MM-DD'),
        entry_type: 'CARTON_LOADED',
        cartons_loaded: values.cartons_loaded,
        pouches_loaded: null,
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
      title={
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>Update Loading</div>
          {shipmentLine && (
            <Text style={{ fontSize: 14, fontWeight: 500, color: '#2563eb' }}>
              {shipmentLine.customer_sku_code}
            </Text>
          )}
        </div>
      }
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={submitting}
      okText="Save Update"
      cancelText="Cancel"
      destroyOnHidden
      width={640}
    >
      {shipmentLine && (
        <>
          {formError && (
            <Alert type="error" title={formError} showIcon style={{ margin: '16px 0' }} />
          )}
          <Form<FormValues> form={form} layout="vertical" onFinish={handleSubmit} style={{ marginTop: 16 }}>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item label="SKU">
                  <Input aria-label="SKU" value={shipmentLine.customer_sku_code} disabled />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="Loadable Qty">
                  <Input
                    aria-label="Loadable Qty"
                    value={`${shipmentLine.planned_qty.toLocaleString()} pcs`}
                    disabled
                  />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item label="Already Loaded Qty">
                  <Input
                    aria-label="Already Loaded Qty"
                    value={`${shipmentLine.actual_loaded_qty.toLocaleString()} pcs`}
                    disabled
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  label="Cartons Loaded Now"
                  name="cartons_loaded"
                  rules={[{ required: true, message: 'Enter how many cartons were loaded.' }]}
                >
                  <InputNumber
                    aria-label="Cartons Loaded Now"
                    min={0}
                    placeholder="Enter cartons"
                    style={{ width: '100%' }}
                  />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item label="Pieces Loaded (Auto)">
              <Input aria-label="Pieces Loaded (Auto)" value="0 pcs" disabled />
              <Text type="secondary" style={{ fontSize: 12 }}>
                Calculated automatically based on cartons.
              </Text>
            </Form.Item>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item label="Net Weight (kg) (Auto)">
                  <Input
                    aria-label="Net Weight (kg) (Auto)"
                    value={formatKg(shipmentLine.net_weight_kg)}
                    disabled
                  />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Calculated automatically.
                  </Text>
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="Gross Weight (kg) (Auto)">
                  <Input
                    aria-label="Gross Weight (kg) (Auto)"
                    value={formatKg(shipmentLine.gross_weight_kg)}
                    disabled
                  />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Calculated automatically.
                  </Text>
                </Form.Item>
              </Col>
            </Row>
            <Form.Item label="Remarks (Optional)" name="remarks">
              <Input.TextArea rows={3} placeholder="Enter remarks (optional)" />
            </Form.Item>
          </Form>
        </>
      )}
    </Modal>
  )
}
