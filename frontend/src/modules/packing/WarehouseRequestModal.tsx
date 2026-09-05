import { useEffect, useState } from 'react'
import { Alert, DatePicker, Form, InputNumber, Modal, Select } from 'antd'
import type { Dayjs } from 'dayjs'
import { ApiError } from '../../shared/api/http'
import { listStorageLocations } from '../product-routes/api'
import type { StorageLocation } from '../product-routes/types'
import { createJobMaterialRequest } from './api'
import type { PackingJob, PackingMaterialRequirementRow } from './types'

interface FormValues {
  item: number
  requested_qty: number
  source_location?: number
  required_by?: Dayjs
}

/** Requests exactly one material row at a time — the spec's own wireframe
 * (§3.6) shows a single-product request form ("Product / Required Qty /
 * Request Qty"), not a multi-line request builder. Repeat the action for
 * each material that needs requesting.
 */
export default function WarehouseRequestModal({
  open,
  job,
  requirement,
  onClose,
  onCreated,
}: {
  open: boolean
  job: PackingJob | null
  requirement: PackingMaterialRequirementRow | null
  onClose: () => void
  onCreated: () => void
}) {
  const [form] = Form.useForm<FormValues>()
  const [locations, setLocations] = useState<StorageLocation[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listStorageLocations({ isActive: true }).then((response) => setLocations(response.results))
  }, [])

  useEffect(() => {
    if (open && requirement) {
      form.resetFields()
      setError(null)
      form.setFieldsValue({ item: requirement.item, requested_qty: requirement.required_qty })
    }
  }, [open, requirement, form])

  if (!job || !requirement) return null

  const handleSubmit = async (values: FormValues) => {
    setError(null)
    setSubmitting(true)
    try {
      await createJobMaterialRequest(job.id, {
        source_location: values.source_location ?? null,
        required_by: values.required_by ? values.required_by.format('YYYY-MM-DD') : null,
        lines_write: [
          {
            item: requirement.item,
            uom: requirement.uom_code,
            required_qty: requirement.required_qty,
            requested_qty: values.requested_qty,
          },
        ],
      })
      onCreated()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create this request.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title="Request Material From Warehouse"
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={submitting}
      okText="Request"
      destroyOnHidden
    >
      {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}
      <Form<FormValues> form={form} layout="vertical" onFinish={handleSubmit}>
        <Form.Item label="Product">
          <Select disabled value={requirement.item} options={[{ value: requirement.item, label: requirement.item_label }]} />
        </Form.Item>
        <Form.Item label="Required Qty">
          <InputNumber disabled value={requirement.required_qty} style={{ width: '100%' }} suffix={requirement.uom_code} />
        </Form.Item>
        <Form.Item
          label="Request Qty"
          name="requested_qty"
          rules={[{ required: true, message: 'Enter a quantity.' }]}
        >
          <InputNumber min={1} style={{ width: '100%' }} suffix={requirement.uom_code} />
        </Form.Item>
        <Form.Item label="Source (optional)" name="source_location">
          <Select
            allowClear
            placeholder="FG Warehouse"
            options={locations.map((l) => ({ value: l.id, label: l.name }))}
          />
        </Form.Item>
        <Form.Item label="Required By (optional)" name="required_by">
          <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
        </Form.Item>
      </Form>
    </Modal>
  )
}
