import { useEffect, useState } from 'react'
import { Alert, Form, InputNumber, Modal, Select } from 'antd'
import { ApiError } from '../../shared/api/http'
import { listEmployees } from '../accounts/api'
import type { Employee } from '../accounts/types'
import { listPackingAllotments, recordBoxingOutput } from './api'
import type { PackingAllotmentRow, WorkCentreRow } from './types'

interface FormValues {
  allotment: number
  boxes_packed: number
  employee_ids?: number[]
}

/** "Add Boxing Record" — one end-of-day entry for a Boxing Work Centre
 * against one of today's released Jobs: pouches in, cartons out. Same
 * retrospective, no-persistent-state pattern as `AddWorkCentreRecordModal`,
 * just against whatever Boxing process the Work Centre is configured with
 * in Settings — that's the only thing that decides its shape. */
export default function AddBoxingRecordModal({
  open,
  workCentre,
  onClose,
  onRecorded,
}: {
  open: boolean
  workCentre: WorkCentreRow | null
  onClose: () => void
  onRecorded: () => void
}) {
  const [form] = Form.useForm<FormValues>()
  const [jobs, setJobs] = useState<PackingAllotmentRow[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      form.resetFields()
      setError(null)
      listPackingAllotments({ status: 'RELEASED', date: new Date().toISOString().slice(0, 10) }).then(
        setJobs,
      )
      listEmployees({ isActive: true }).then((response) => setEmployees(response.results))
    }
  }, [open, form])

  if (!workCentre) return null

  const handleSubmit = async (values: FormValues) => {
    setError(null)
    setSubmitting(true)
    try {
      await recordBoxingOutput({
        allotment: values.allotment,
        work_centre: workCentre.id,
        boxes_packed: values.boxes_packed || 0,
        employee_ids: values.employee_ids ?? [],
      })
      onRecorded()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this record.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title={`Add Boxing Record — ${workCentre.code}`}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={submitting}
      okText="Save"
      destroyOnHidden
    >
      {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}
      <Form<FormValues> form={form} layout="vertical" onFinish={(values) => void handleSubmit(values)}>
        <Form.Item
          label="Job ID"
          name="allotment"
          rules={[{ required: true, message: 'Pick which Job this Boxing entry is against.' }]}
        >
          <Select
            placeholder="Select a Job released to the packing floor today"
            options={jobs.map((job) => ({
              value: job.id,
              label: `${job.job_id} — ${job.customer_sku_code}`,
            }))}
          />
        </Form.Item>
        <Form.Item label="Operators" name="employee_ids">
          <Select
            mode="multiple"
            placeholder="Who worked this?"
            showSearch
            optionFilterProp="label"
            options={employees.map((e) => ({ value: e.id, label: e.full_name }))}
          />
        </Form.Item>
        <Form.Item
          label="Boxes Packed"
          name="boxes_packed"
          rules={[{ required: true, message: 'Enter how many boxes were packed.' }]}
          initialValue={0}
        >
          <InputNumber min={0} style={{ width: '100%' }} />
        </Form.Item>
      </Form>
    </Modal>
  )
}
