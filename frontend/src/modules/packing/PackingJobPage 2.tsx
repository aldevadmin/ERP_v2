import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import {
  Alert,
  Breadcrumb,
  Button,
  Card,
  Descriptions,
  Progress,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd'
import { ApiError } from '../../shared/api/http'
import AllocateWorkCentreModal from './AllocateWorkCentreModal'
import {
  getPackingJob,
  listJobAllocations,
  listJobMaterialRequests,
  listJobMaterialRequirements,
  receiveMaterialRequest,
  startWorkSession,
} from './api'
import AutoAllocateModal from './AutoAllocateModal'
import WarehouseRequestModal from './WarehouseRequestModal'
import type {
  PackingJob,
  PackingJobStatus,
  PackingMaterialRequest,
  PackingMaterialRequirementRow,
  PackingWorkCentreAllocation,
} from './types'

const { Title, Text } = Typography

const STATUS_COLORS: Record<PackingJobStatus, string> = {
  AWAITING_MATERIAL: 'default',
  READY: 'blue',
  IN_PROGRESS: 'processing',
  COMPLETED: 'green',
  ON_HOLD: 'orange',
  CANCELLED: 'red',
}

export default function PackingJobPage() {
  const { jobId } = useParams<{ jobId: string }>()
  const navigate = useNavigate()
  const [job, setJob] = useState<PackingJob | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('overview')

  const [requirements, setRequirements] = useState<PackingMaterialRequirementRow[]>([])
  const [requests, setRequests] = useState<PackingMaterialRequest[]>([])
  const [allocations, setAllocations] = useState<PackingWorkCentreAllocation[]>([])
  const [requestingFor, setRequestingFor] = useState<PackingMaterialRequirementRow | null>(null)
  const [allocating, setAllocating] = useState(false)
  const [autoAllocating, setAutoAllocating] = useState(false)

  const load = useCallback(() => {
    if (!jobId) return
    setLoading(true)
    getPackingJob(Number(jobId))
      .then(setJob)
      .catch(() => setError('Could not load this job.'))
      .finally(() => setLoading(false))
  }, [jobId])

  useEffect(() => {
    load()
  }, [load])

  const loadMaterial = useCallback(() => {
    if (!jobId) return
    listJobMaterialRequirements(Number(jobId)).then(setRequirements)
    listJobMaterialRequests(Number(jobId)).then(setRequests)
  }, [jobId])

  const loadAllocations = useCallback(() => {
    if (!jobId) return
    listJobAllocations(Number(jobId)).then(setAllocations)
  }, [jobId])

  useEffect(() => {
    if (activeTab === 'material') loadMaterial()
    if (activeTab === 'work-centres' || activeTab === 'transactions') loadAllocations()
  }, [activeTab, loadMaterial, loadAllocations])

  const handleStartSession = async (allocation: PackingWorkCentreAllocation) => {
    try {
      const session = await startWorkSession(allocation.id)
      navigate(`/packing/work-sessions/${session.id}`)
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : 'Could not start this session.')
    }
  }

  const handleReceive = async (requestId: number, lineId: number, requiredQty: number) => {
    try {
      await receiveMaterialRequest(requestId, [
        { request_line: lineId, quantity_issued: requiredQty, quantity_received: requiredQty },
      ])
      message.success('Material received.')
      loadMaterial()
      load()
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : 'Could not record receipt.')
    }
  }

  if (loading || !job) {
    return (
      <Card loading={loading}>
        {error && <Alert type="error" title={error} showIcon />}
      </Card>
    )
  }

  const requirementItemsWithRequest = new Set(
    requests.flatMap((r) => r.lines.map((l) => l.item)),
  )

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 12 }}
        items={[
          { title: <Link to="/packing/orders">Packing Orders</Link> },
          { title: job.job_number },
        ]}
      />
      <Card>
        <div style={{ marginBottom: 16 }}>
          <Title level={4} style={{ margin: 0 }}>
            {job.job_number} — {job.item_name}{' '}
            <Tag color={STATUS_COLORS[job.status]}>{job.status.replace('_', ' ')}</Tag>
          </Title>
          <Text type="secondary">
            {job.order_no} • {job.customer_name}
          </Text>
        </div>
        <Descriptions column={4} size="small" style={{ marginBottom: 16 }}>
          <Descriptions.Item label="Date">{job.date}</Descriptions.Item>
          <Descriptions.Item label="Shift">{job.shift_name}</Descriptions.Item>
          <Descriptions.Item label="Bay">{job.bay_name}</Descriptions.Item>
          <Descriptions.Item label="Target">{job.target_qty.toLocaleString()}</Descriptions.Item>
          <Descriptions.Item label="Packed">{job.packed_qty.toLocaleString()}</Descriptions.Item>
          <Descriptions.Item label="Balance">{job.balance_qty.toLocaleString()}</Descriptions.Item>
        </Descriptions>

        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: 'overview',
              label: 'Overview',
              children: (
                <div>
                  <Progress percent={Math.round((job.packed_qty / (job.target_qty || 1)) * 100)} />
                  <Descriptions column={1} bordered size="small" style={{ marginTop: 16 }}>
                    <Descriptions.Item label="Material Received">
                      Awaiting/received — see Material tab
                    </Descriptions.Item>
                    <Descriptions.Item label="Work Centre Allocated">
                      {job.allocated_qty.toLocaleString()} / {job.target_qty.toLocaleString()}
                    </Descriptions.Item>
                    <Descriptions.Item label="Packed">
                      {job.packed_qty.toLocaleString()} / {job.target_qty.toLocaleString()} (
                      {Math.round((job.packed_qty / (job.target_qty || 1)) * 100)}%)
                    </Descriptions.Item>
                    <Descriptions.Item label="Standard">
                      {job.standard_qty.toLocaleString()} pcs
                    </Descriptions.Item>
                    <Descriptions.Item label="Reject">
                      {job.reject_qty.toLocaleString()} pcs
                    </Descriptions.Item>
                  </Descriptions>
                </div>
              ),
            },
            {
              key: 'material',
              label: 'Material',
              children: (
                <div>
                  <Table
                    rowKey="item"
                    size="small"
                    pagination={false}
                    dataSource={requirements}
                    style={{ marginBottom: 16 }}
                    columns={[
                      { title: 'Item', dataIndex: 'item_label' },
                      {
                        title: 'Required',
                        dataIndex: 'required_qty',
                        render: (v: number, r) => `${v.toLocaleString()} ${r.uom_code}`,
                      },
                      {
                        title: '',
                        key: 'actions',
                        render: (_, r) =>
                          requirementItemsWithRequest.has(r.item) ? (
                            <Tag color="blue">Requested</Tag>
                          ) : (
                            <Button size="small" onClick={() => setRequestingFor(r)}>
                              Request From Warehouse
                            </Button>
                          ),
                      },
                    ]}
                  />
                  {requests.length > 0 && (
                    <>
                      <Text strong style={{ display: 'block', marginTop: 24, marginBottom: 8 }}>
                        Requests
                      </Text>
                      {requests.map((req) => (
                        <Table
                          key={req.id}
                          rowKey="id"
                          size="small"
                          pagination={false}
                          dataSource={req.lines}
                          style={{ marginBottom: 12 }}
                          columns={[
                            { title: 'Item', dataIndex: 'item_name' },
                            { title: 'Requested', dataIndex: 'requested_qty' },
                            { title: 'Issued', dataIndex: 'issued_qty' },
                            { title: 'Received', dataIndex: 'received_qty' },
                            { title: 'Status', dataIndex: 'status', render: (v: string) => <Tag>{v}</Tag> },
                            {
                              title: '',
                              key: 'actions',
                              render: (_, line) =>
                                line.status !== 'RECEIVED' ? (
                                  <Button
                                    size="small"
                                    onClick={() => void handleReceive(req.id, line.id, line.balance_qty)}
                                  >
                                    Mark Received
                                  </Button>
                                ) : null,
                            },
                          ]}
                        />
                      ))}
                    </>
                  )}
                </div>
              ),
            },
            {
              key: 'work-centres',
              label: 'Work Centres',
              children: (
                <div>
                  <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between' }}>
                    <Text>
                      Target: {job.target_qty.toLocaleString()} &nbsp; Allocated:{' '}
                      {job.allocated_qty.toLocaleString()} &nbsp; Unallocated:{' '}
                      {Math.max(job.target_qty - job.allocated_qty, 0).toLocaleString()}
                    </Text>
                    <Button onClick={() => setAutoAllocating(true)}>Auto Allocate</Button>
                  </div>
                  <Table
                    rowKey="id"
                    size="small"
                    pagination={false}
                    dataSource={allocations}
                    columns={[
                      { title: 'Seq', dataIndex: 'sequence', width: 60 },
                      { title: 'Work Centre', dataIndex: 'work_centre_code' },
                      {
                        title: 'Operators',
                        key: 'operators',
                        render: (_, a) => a.operators.map((o) => o.employee_name).join(' + '),
                      },
                      { title: 'Assigned', dataIndex: 'assigned_qty' },
                      { title: 'Packed', dataIndex: 'packed_qty' },
                      { title: 'Balance', dataIndex: 'balance_qty' },
                      {
                        title: 'Progress',
                        key: 'progress',
                        render: (_, a) => (
                          <Progress
                            percent={Math.round((a.packed_qty / (a.assigned_qty || 1)) * 100)}
                            size="small"
                          />
                        ),
                      },
                      { title: 'Status', dataIndex: 'status', render: (v: string) => <Tag>{v}</Tag> },
                      {
                        title: '',
                        key: 'actions',
                        render: (_, a) =>
                          a.status === 'PLANNED' || a.status === 'READY' ? (
                            <Button size="small" type="primary" onClick={() => void handleStartSession(a)}>
                              Start
                            </Button>
                          ) : a.status === 'RUNNING' ? (
                            <Button
                              size="small"
                              onClick={() => {
                                const running = a.sessions.find((s) => s.status === 'RUNNING')
                                if (running) navigate(`/packing/work-sessions/${running.id}`)
                              }}
                            >
                              Resume
                            </Button>
                          ) : null,
                      },
                    ]}
                  />
                  <Button style={{ marginTop: 12 }} onClick={() => setAllocating(true)}>
                    + Add Work Centre Allocation
                  </Button>
                </div>
              ),
            },
            {
              key: 'transactions',
              label: 'Transactions',
              children: (
                <Table
                  rowKey="id"
                  size="small"
                  pagination={false}
                  dataSource={allocations}
                  columns={[
                    { title: 'Work Centre', dataIndex: 'work_centre_code' },
                    {
                      title: 'Operators',
                      key: 'operators',
                      render: (_, a) => a.operators.map((o) => o.employee_name).join('/'),
                    },
                    { title: 'Assigned', dataIndex: 'assigned_qty' },
                    { title: 'Packed', dataIndex: 'packed_qty' },
                    { title: 'Status', dataIndex: 'status', render: (v: string) => <Tag>{v}</Tag> },
                  ]}
                  summary={() => (
                    <Table.Summary.Row>
                      <Table.Summary.Cell index={0} colSpan={2}>
                        <Text strong>Totals</Text>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={1}>
                        <Text strong>
                          {allocations.reduce((s, a) => s + a.assigned_qty, 0).toLocaleString()}
                        </Text>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={2}>
                        <Text strong>
                          {allocations.reduce((s, a) => s + a.packed_qty, 0).toLocaleString()}
                        </Text>
                      </Table.Summary.Cell>
                    </Table.Summary.Row>
                  )}
                />
              ),
            },
          ]}
        />
      </Card>

      <WarehouseRequestModal
        open={requestingFor !== null}
        job={job}
        requirement={requestingFor}
        onClose={() => setRequestingFor(null)}
        onCreated={() => {
          setRequestingFor(null)
          loadMaterial()
        }}
      />
      <AllocateWorkCentreModal
        open={allocating}
        job={job}
        onClose={() => setAllocating(false)}
        onCreated={() => {
          setAllocating(false)
          loadAllocations()
          load()
        }}
      />
      <AutoAllocateModal
        open={autoAllocating}
        job={job}
        onClose={() => setAutoAllocating(false)}
        onAllocated={() => {
          setAutoAllocating(false)
          loadAllocations()
          load()
        }}
      />
    </div>
  )
}
