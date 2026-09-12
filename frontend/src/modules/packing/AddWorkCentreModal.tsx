import { useEffect, useState } from 'react'
import { Alert, Form, InputNumber, Modal, Radio, Select, Typography } from 'antd'
import { ApiError } from '../../shared/api/http'
import { listEmployees } from '../accounts/api'
import type { Employee } from '../accounts/types'
import { listWorkCentres } from '../work-centres/api'
import type { WorkCentre } from '../work-centres/types'
import { assignWork, startAllocation, startPackingShift } from './api'
import type { PackingJob, PackingWorkCentreSession } from './types'

const { Text } = Typography

interface FormValues {
  work_centre: number
  operators?: number[]
  assigned_qty: number
  start_mode: 'immediate' | 'queue'
}

/** Add a Work Centre to a Job — spec v5 §6.7 "Running jobs may add Work
 * Centres dynamically." Covers both cases in one flow: picking a Work
 * Centre already part of today's shift (queues/starts an allocation on
 * its existing session), or one that isn't yet (spins up a fresh session
 * with the given operators first, reusing the same idempotent
 * `/packing-shifts/start/` endpoint Shift Setup itself calls). Also
 * doubles as "Assign to Work Centre" for a still-Unassigned Job — same
 * action, just reached from a different list.
 */
export default function AddWorkCentreModal({
  open,
  job,
  sessions,
  date,
  shiftId,
  onClose,
  onAssigned,
}: {
  open: boolean
  job: PackingJob | null
  sessions: PackingWorkCentreSession[]
  date: string
  shiftId: number
  onClose: () => void
  onAssigned: () => void
}) {
  const [form] = Form.useForm<FormValues>()
  const [workCentres, setWorkCentres] = useState<WorkCentre[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const selectedWorkCentreId = Form.useWatch('work_centre', form)

  useEffect(() => {
    if (open && job) {
      form.resetFields()
      setError(null)
      listWorkCentres({ isActive: true }).then((response) =>
        setWorkCentres(response.results.filter((wc) => wc.bay === job.bay)),
      )
      listEmployees({ isActive: true }).then((response) => setEmployees(response.results))
      form.setFieldsValue({
        assigned_qty: job.target_qty - job.allocated_qty,
        start_mode: 'immediate',
      })
    }
  }, [open, job, form])

  if (!job) return null

  const remaining = job.target_qty - job.allocated_qty
  const selectedWorkCentre = workCentres.find((wc) => wc.id === selectedWorkCentreId) ?? null
  const existingSession = selectedWorkCentre
    ? sessions.find((s) => s.work_centre === selectedWorkCentre.id) ?? null
    : null
  const needsNewSession = selectedWorkCentre !== null && existingSession === null
  const sessionBusy = !!existingSession?.current_allocation_id

  const workCentreOptions = workCentres.map((wc) => {
    const existing = sessions.find((s) => s.work_centre === wc.id)
    const label = existing ? `${wc.code} — ${existing.status}` : `${wc.code} — not started yet`
    return { value: wc.id, label }
  })

  const handleSubmit = async (values: FormValues) => {
    setError(null)
    setSubmitting(true)
    try {
      let sessionId = existingSession?.id
      if (!sessionId) {
        const updatedShift = await startPackingShift(date, shiftId, [
          { work_centre: values.work_centre, operator_ids: values.operators ?? [] },
        ])
        const newSession = updatedShift.work_centre_sessions.find(
          (s) => s.work_centre === values.work_centre,
        )
        if (!newSession) throw new Error('Could not start this Work Centre.')
        sessionId = newSession.id
      }
      const allocation = await assignWork(sessionId, {
        job: job.id,
        assigned_qty: values.assigned_qty,
      })
      if (values.start_mode === 'immediate' && !sessionBusy) {
        await startAllocation(allocation.id)
      }
      onAssigned()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add this Work Centre.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title={`Add Work Centre to ${job.job_number}`}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={submitting}
      okText="Add Work Centre"
      destroyOnHidden
    >
      {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}
      {workCentreOptions.length === 0 ? (
        <Text type="secondary">No Work Centres are configured in {job.bay_name}.</Text>
      ) : (
        <Form<FormValues> form={form} layout="vertical" onFinish={(values) => void handleSubmit(values)}>
          <Form.Item
            label="Work Centre"
            name="work_centre"
            rules={[{ required: true, message: 'Pick a Work Centre.' }]}
          >
            <Select options={workCentreOptions} />
          </Form.Item>

          {needsNewSession && selectedWorkCentre && (
            <Form.Item
              label={`Operators (${selectedWorkCentre.operator_count})`}
              name="operators"
              rules={[{ required: true, message: 'Assign at least one operator.' }]}
            >
              <Select
                mode="multiple"
                maxCount={selectedWorkCentre.operator_count}
                placeholder="Select operators"
                showSearch
                optionFilterProp="label"
                options={employees.map((e) => ({ value: e.id, label: e.full_name }))}
              />
            </Form.Item>
          )}

          <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
            Balance to allocate: {remaining.toLocaleString()} pcs
          </Text>
          <Form.Item
            label="Quantity to Allocate"
            name="assigned_qty"
            rules={[
              { required: true, message: 'Enter a quantity.' },
              {
                validator: (_, value: number) =>
                  value > 0 && value <= remaining
                    ? Promise.resolve()
                    : Promise.reject(new Error(`Must be between 1 and ${remaining.toLocaleString()}.`)),
              },
            ]}
          >
            <InputNumber min={1} style={{ width: '100%' }} suffix="pcs" />
          </Form.Item>

          <Form.Item label="Start" name="start_mode">
            <Radio.Group
              optionType="button"
              options={[
                { value: 'immediate', label: 'Immediately', disabled: sessionBusy },
                { value: 'queue', label: 'Add to Queue' },
              ]}
            />
          </Form.Item>
          {sessionBusy && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              This Work Centre is already running something else — this will queue behind it.
            </Text>
          )}
        </Form>
      )}
    </Modal>
  )
}
