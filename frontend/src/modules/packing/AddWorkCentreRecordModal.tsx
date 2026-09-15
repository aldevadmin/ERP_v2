import { useEffect, useState } from 'react'
import { Alert, Form, InputNumber, Modal, Select, Typography } from 'antd'
import { ApiError } from '../../shared/api/http'
import { listEmployees } from '../accounts/api'
import type { Employee } from '../accounts/types'
import { listPackingAllotments, recordWorkCentreOutput } from './api'
import type { PackingAllotmentRow, WorkCentreRow } from './types'

const { Text } = Typography

interface FormValues {
  allotment: number
  packed_plates: number
  pouches_packed: number
  downgraded: number
  rejected: number
  employee_ids?: number[]
}

/** "Add Records" — one end-of-day entry for a Work Centre against one of
 * today's released Jobs. No persistent "this WC is working Job X" state:
 * the Job is picked fresh each time this is opened, matching how entries
 * are actually made (retrospectively, after a WC has already worked
 * through several Jobs in a day). */
export default function AddWorkCentreRecordModal({
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
      await recordWorkCentreOutput({
        allotment: values.allotment,
        work_centre: workCentre.id,
        packed_plates: values.packed_plates || 0,
        pouches_packed: values.pouches_packed || 0,
        downgraded: values.downgraded || 0,
        rejected: values.rejected || 0,
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
      title={`Add Records — ${workCentre.code}`}
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
          rules={[{ required: true, message: "Pick which Job this Work Centre worked." }]}
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
          label="Packed Plates (Good)"
          name="packed_plates"
          rules={[{ required: true, message: 'Enter a quantity (0 if none).' }]}
          initialValue={0}
        >
          <InputNumber min={0} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item label="Packed Pouches" name="pouches_packed" initialValue={0}>
          <InputNumber min={0} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item label="Downgraded (Standard)" name="downgraded" initialValue={0}>
          <InputNumber min={0} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item label="Rejected Plates (Scrap)" name="rejected" initialValue={0}>
          <InputNumber min={0} style={{ width: '100%' }} />
        </Form.Item>
        <Text type="secondary" style={{ fontSize: 12 }}>
          Downgraded and Rejected plates go back to the warehouse — they don't count toward this
          Job's packed progress.
        </Text>
      </Form>
    </Modal>
  )
}
