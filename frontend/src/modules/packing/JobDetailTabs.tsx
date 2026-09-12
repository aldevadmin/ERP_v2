import { useCallback, useEffect, useState } from 'react'
import { Descriptions, Progress, Table, Tabs, Tag, Typography } from 'antd'
import dayjs from 'dayjs'
import { listJobAllocations, listJobEvents } from './api'
import type { PackingJob, PackingJobEvent, PackingWorkCentreAllocation } from './types'

const { Text } = Typography

function HistoryTable({ events }: { events: PackingJobEvent[] }) {
  return (
    <Table<PackingJobEvent>
      rowKey="id"
      size="small"
      pagination={false}
      dataSource={events}
      locale={{ emptyText: 'No lifecycle events recorded yet.' }}
      columns={[
        {
          title: 'When',
          dataIndex: 'created_at',
          render: (v: string) => dayjs(v).format('DD MMM YYYY HH:mm'),
        },
        {
          title: 'Event',
          dataIndex: 'event_type',
          render: (v: string) => <Tag>{v}</Tag>,
        },
        { title: 'Reason', dataIndex: 'reason', render: (v: string) => v || '—' },
        { title: 'By', dataIndex: 'performed_by_name', render: (v: string) => v || 'System' },
        {
          title: 'Remarks',
          dataIndex: 'remarks',
          render: (v: string) => v || <Text type="secondary">—</Text>,
        },
      ]}
    />
  )
}

/** Overview/(Work Centres)/Transactions/History tabs for one Packing Job
 * — shared between the standalone Job Detail page and Packing Floor's
 * "Focused Job" panel. Material lives outside this component entirely
 * now (`JobMaterialSection`, always visible rather than behind a tab).
 * `variant="floor"` drops Overview/Work Centres/Transactions — all of it
 * cross-station rollups or numbers already visible on the floor itself —
 * leaving just History, shown directly without a Tabs wrapper.
 */
export default function JobDetailTabs({
  job,
  variant = 'full',
}: {
  job: PackingJob
  variant?: 'full' | 'floor'
}) {
  const [activeTab, setActiveTab] = useState('overview')
  const [allocations, setAllocations] = useState<PackingWorkCentreAllocation[]>([])
  const [events, setEvents] = useState<PackingJobEvent[]>([])

  const loadAllocations = useCallback(() => {
    listJobAllocations(job.id).then(setAllocations)
  }, [job.id])

  const loadEvents = useCallback(() => {
    listJobEvents(job.id).then(setEvents)
  }, [job.id])

  useEffect(() => {
    if (variant === 'floor') {
      loadEvents()
      return
    }
    if (activeTab === 'work-centres' || activeTab === 'transactions') loadAllocations()
    if (activeTab === 'history') loadEvents()
  }, [variant, activeTab, loadAllocations, loadEvents])

  if (variant === 'floor') {
    return <HistoryTable events={events} />
  }

  const items = [
    {
      key: 'overview',
      label: 'Overview',
      children: (
        <div>
          <Progress
            percent={Math.round(
              ((job.target_qty - job.balance_qty) / (job.target_qty || 1)) * 100,
            )}
          />
          <Descriptions column={1} bordered size="small" style={{ marginTop: 16 }}>
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
            <Descriptions.Item label="Reject">{job.reject_qty.toLocaleString()} pcs</Descriptions.Item>
          </Descriptions>
        </div>
      ),
    },
    {
      key: 'work-centres',
      label: 'Work Centres',
      children: (
        <div>
          <div style={{ marginBottom: 12 }}>
            Target: {job.target_qty.toLocaleString()} &nbsp; Allocated:{' '}
            {job.allocated_qty.toLocaleString()} &nbsp; Unallocated:{' '}
            {Math.max(job.target_qty - job.allocated_qty, 0).toLocaleString()}
          </div>
          <Table
            rowKey="id"
            size="small"
            pagination={false}
            dataSource={allocations}
            locale={{ emptyText: 'Not yet assigned to a Work Centre.' }}
            columns={[
              { title: 'Work Centre', dataIndex: 'work_centre_code' },
              { title: 'Assigned', dataIndex: 'assigned_qty' },
              { title: 'Packed', dataIndex: 'packed_qty' },
              { title: 'Balance', dataIndex: 'balance_qty' },
              {
                title: 'Progress',
                key: 'progress',
                render: (_, a) => (
                  <Progress
                    percent={Math.round(
                      ((a.assigned_qty - a.balance_qty) / (a.assigned_qty || 1)) * 100,
                    )}
                    size="small"
                  />
                ),
              },
              { title: 'Status', dataIndex: 'status', render: (v: string) => <Tag>{v}</Tag> },
            ]}
          />
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
            { title: 'Assigned', dataIndex: 'assigned_qty' },
            { title: 'Packed', dataIndex: 'packed_qty' },
            { title: 'Status', dataIndex: 'status', render: (v: string) => <Tag>{v}</Tag> },
          ]}
          summary={() => (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0}>
                <b>Totals</b>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={1}>
                <b>{allocations.reduce((s, a) => s + a.assigned_qty, 0).toLocaleString()}</b>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={2}>
                <b>{allocations.reduce((s, a) => s + a.packed_qty, 0).toLocaleString()}</b>
              </Table.Summary.Cell>
            </Table.Summary.Row>
          )}
        />
      ),
    },
    {
      key: 'history',
      label: 'History',
      children: <HistoryTable events={events} />,
    },
  ]

  return <Tabs activeKey={activeTab} onChange={setActiveTab} items={items} />
}
