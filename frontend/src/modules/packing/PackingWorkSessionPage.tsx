import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import {
  Alert,
  Breadcrumb,
  Button,
  Card,
  Divider,
  Flex,
  Input,
  InputNumber,
  Select,
  Tag,
  Typography,
  message,
} from 'antd'
import { CheckCircleFilled } from '@ant-design/icons'
import { ApiError } from '../../shared/api/http'
import { listEmployees } from '../accounts/api'
import type { Employee } from '../accounts/types'
import { getProcess } from '../processes/api'
import type { Process } from '../processes/types'
import { getWorkCentre } from '../work-centres/api'
import { completeWorkSession, getAllocation, getPackingJob, getWorkSession } from './api'
import type { PackingJob, PackingWorkCentreAllocation, PackingWorkSession } from './types'

const { Title, Text } = Typography

export default function PackingWorkSessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const [session, setSession] = useState<PackingWorkSession | null>(null)
  const [allocation, setAllocation] = useState<PackingWorkCentreAllocation | null>(null)
  const [job, setJob] = useState<PackingJob | null>(null)
  const [processOptions, setProcessOptions] = useState<{ value: number; label: string }[]>([])
  const [processId, setProcessId] = useState<number | null>(null)
  const [process, setProcess] = useState<Process | null>(null)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [batchLotNumber, setBatchLotNumber] = useState('')
  const [selectedEmployees, setSelectedEmployees] = useState<number[]>([])
  const [inputQty, setInputQty] = useState<number | null>(null)
  const [outputQty, setOutputQty] = useState<Record<number, number | null>>({})
  const [remarks, setRemarks] = useState('')

  useEffect(() => {
    if (!sessionId) return
    setLoading(true)
    getWorkSession(Number(sessionId))
      .then(async (loadedSession) => {
        setSession(loadedSession)
        const loadedAllocation = await getAllocation(loadedSession.allocation)
        setAllocation(loadedAllocation)
        setInputQty(loadedAllocation.assigned_qty)
        setSelectedEmployees(loadedAllocation.operators.map((o) => o.employee))

        const [loadedJob, workCentre] = await Promise.all([
          getPackingJob(loadedAllocation.job),
          getWorkCentre(loadedAllocation.work_centre),
        ])
        setJob(loadedJob)

        const options = workCentre.capabilities.map((c) => ({
          value: c.process_definition,
          label: `${c.process_name} (${c.process_code})`,
        }))
        setProcessOptions(options)
        if (options.length > 0) setProcessId(options[0].value)
      })
      .catch(() => setError('Could not load this session.'))
      .finally(() => setLoading(false))
    listEmployees().then((response) => setEmployees(response.results))
  }, [sessionId])

  useEffect(() => {
    if (processId === null) return
    getProcess(processId).then((loaded) => {
      setProcess(loaded)
      setOutputQty((prev) => {
        const next: Record<number, number | null> = {}
        for (const output of loaded.outputs) {
          next[output.id] = prev[output.id] ?? null
        }
        return next
      })
    })
  }, [processId])

  const totalOutput = useMemo(
    () => Object.values(outputQty).reduce<number>((sum, v) => sum + (v ?? 0), 0),
    [outputQty],
  )
  const isBalanced = inputQty !== null && totalOutput === inputQty

  const handleSubmit = async (complete: boolean) => {
    if (!session || !process || !allocation) return
    setError(null)
    setSubmitting(true)
    try {
      const payload = {
        process_version: process.version_id,
        batch_lot_number: batchLotNumber,
        employees: selectedEmployees,
        inputs_write: process.inputs.map((input) => ({
          input_definition: input.id,
          quantity: inputQty ?? 0,
        })),
        outputs_write: process.outputs.map((output) => ({
          output_definition: output.id,
          quantity: outputQty[output.id] ?? 0,
        })),
        remarks,
      }
      const updated = await completeWorkSession(session.id, payload)
      setSession(updated)
      if (complete) {
        message.success('Work recorded.')
        navigate(`/packing/jobs/${allocation.job}`)
      } else {
        message.success('Draft saved.')
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this session.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading || !session || !allocation) {
    return (
      <Card loading={loading}>{error && <Alert type="error" title={error} showIcon />}</Card>
    )
  }

  if (processOptions.length === 0) {
    return (
      <Card>
        <Alert
          type="warning"
          showIcon
          title="No process mapped to this work centre"
          description="Map a Process to this Work Centre's capabilities in Settings before recording work here."
        />
      </Card>
    )
  }

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 12 }}
        items={[
          { title: <Link to="/packing/orders">Packing Orders</Link> },
          ...(job ? [{ title: <Link to={`/packing/jobs/${job.id}`}>{job.job_number}</Link> }] : []),
          { title: `${allocation.work_centre_code} — Packing Entry` },
        ]}
      />
      <Card style={{ maxWidth: 720, margin: '0 auto' }}>
        <Title level={4} style={{ marginBottom: 0 }}>
          {allocation.work_centre_code} — Packing Entry
        </Title>
        {job && (
          <Text type="secondary">
            {job.job_number} • {job.order_no} • {job.item_name}
          </Text>
        )}
        <div>
          <Text type="secondary">
            {allocation.date} • {allocation.shift_name} •{' '}
            {allocation.operators.map((o) => o.employee_name).join(' + ') || 'No operators yet'}
          </Text>
        </div>

        <Divider />
        {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}

        <Flex justify="space-between" style={{ marginBottom: 16 }}>
          <Text strong>Assigned Quantity</Text>
          <Text strong>{allocation.assigned_qty.toLocaleString()} pcs</Text>
        </Flex>

        {processOptions.length > 1 && (
          <Select
            style={{ width: '100%', marginBottom: 16 }}
            value={processId}
            onChange={setProcessId}
            options={processOptions}
          />
        )}

        {process && (
          <>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>
              {process.name.toUpperCase()}
            </Text>
            <Flex vertical gap={8} style={{ marginBottom: 12 }}>
              {process.outputs.map((output) => (
                <Flex key={output.id} justify="space-between" align="center">
                  <Text>
                    {output.classification_name} <Text type="secondary">({output.item_label})</Text>
                  </Text>
                  <InputNumber
                    min={0}
                    style={{ width: 140 }}
                    value={outputQty[output.id] ?? null}
                    onChange={(v) => setOutputQty((prev) => ({ ...prev, [output.id]: v }))}
                  />
                </Flex>
              ))}
              <Flex justify="space-between" align="center" style={{ borderTop: '1px solid #f0f0f0', paddingTop: 8 }}>
                <Text strong>Total</Text>
                <Flex align="center" gap={8}>
                  <Text strong>{totalOutput.toLocaleString()}</Text>
                  {isBalanced ? (
                    <Tag color="success" icon={<CheckCircleFilled />}>
                      Balanced
                    </Tag>
                  ) : (
                    <Tag color="warning">Not balanced ({inputQty ?? 0} expected)</Tag>
                  )}
                </Flex>
              </Flex>
            </Flex>

            {process.inputs.length > 0 && (
              <Flex justify="space-between" align="center" style={{ marginBottom: 16 }}>
                <Text>{process.inputs[0].item_label} (processed qty)</Text>
                <InputNumber
                  min={0}
                  style={{ width: 140 }}
                  value={inputQty}
                  onChange={setInputQty}
                />
              </Flex>
            )}

            {process.batch_lot_mode !== 'DISABLED' && (
              <Flex vertical style={{ marginBottom: 16 }}>
                <Text style={{ marginBottom: 4 }}>
                  Batch / Lot Number{process.batch_lot_mode === 'REQUIRED' ? ' *' : ' (optional)'}
                </Text>
                <Input
                  value={batchLotNumber}
                  onChange={(e) => setBatchLotNumber(e.target.value)}
                  placeholder="e.g. B-0908-1"
                />
              </Flex>
            )}

            <Flex vertical style={{ marginBottom: 16 }}>
              <Text style={{ marginBottom: 4 }}>Operators</Text>
              <Select
                mode="multiple"
                showSearch
                optionFilterProp="label"
                value={selectedEmployees}
                onChange={setSelectedEmployees}
                options={employees.map((e) => ({ value: e.id, label: e.full_name }))}
              />
            </Flex>

            <Flex vertical style={{ marginBottom: 16 }}>
              <Text style={{ marginBottom: 4 }}>Remarks</Text>
              <Input.TextArea
                rows={2}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
              />
            </Flex>

            <Flex justify="end" gap={8}>
              <Button loading={submitting} onClick={() => void handleSubmit(false)}>
                Save Draft
              </Button>
              <Button type="primary" loading={submitting} onClick={() => void handleSubmit(true)}>
                Complete Work
              </Button>
            </Flex>
          </>
        )}
      </Card>
    </div>
  )
}
