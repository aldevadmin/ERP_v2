import { useEffect, useState } from 'react'
import { Button, Descriptions, Drawer, Flex, Progress, Table, Tag, Typography } from 'antd'
import dayjs from 'dayjs'
import { listIntervalRecords } from './api'
import type { PackingIntervalRecord, PackingWorkCentreSession } from './types'

const { Title, Text } = Typography

export default function WorkCentreDetailDrawer({
  open,
  session,
  onClose,
  onRecordHour,
  onCompleteOrChangeSku,
  onReportIssue,
  onStopWorkCentre,
  onStartAllocation,
}: {
  open: boolean
  session: PackingWorkCentreSession | null
  onClose: () => void
  onRecordHour: () => void
  onCompleteOrChangeSku: () => void
  onReportIssue: () => void
  onStopWorkCentre: () => void
  onStartAllocation: (allocationId: number) => void
}) {
  const [records, setRecords] = useState<PackingIntervalRecord[]>([])

  const current = session?.allocations.find((a) => a.id === session.current_allocation_id) ?? null
  const queue = session?.allocations.filter((a) => a.status === 'PLANNED').sort((a, b) => a.sequence - b.sequence) ?? []

  useEffect(() => {
    if (open && current) {
      listIntervalRecords(current.id).then(setRecords)
    } else {
      setRecords([])
    }
  }, [open, current])

  if (!session) return null

  const progress = current ? Math.round((current.processed_qty / (current.assigned_qty || 1)) * 100) : 0

  return (
    <Drawer title={`${session.work_centre_code} — ${session.status}`} open={open} onClose={onClose} width={480}>
      <Text type="secondary">{session.operators.map((o) => o.employee_name).join(' + ')}</Text>
      <div style={{ marginTop: 4, marginBottom: 16 }}>
        <Text type="secondary">
          Started: {session.started_at ? dayjs(session.started_at).format('HH:mm') : '—'}
        </Text>
      </div>

      {current ? (
        <>
          <Title level={5}>Current Work</Title>
          <Descriptions column={1} size="small" bordered style={{ marginBottom: 12 }}>
            <Descriptions.Item label={`${current.order_no} • ${current.item_name}`}>
              &nbsp;
            </Descriptions.Item>
            <Descriptions.Item label="Assigned">{current.assigned_qty.toLocaleString()} pcs</Descriptions.Item>
            <Descriptions.Item label="Processed">{current.processed_qty.toLocaleString()} pcs</Descriptions.Item>
            <Descriptions.Item label="Packed">{current.packed_qty.toLocaleString()} pcs</Descriptions.Item>
          </Descriptions>
          <Progress percent={progress} style={{ marginBottom: 16 }} />

          <Flex gap={8} style={{ marginBottom: 20 }} wrap="wrap">
            <Button size="small" type="primary" onClick={onRecordHour}>
              Record Hour
            </Button>
            <Button size="small" onClick={onCompleteOrChangeSku}>
              Complete SKU
            </Button>
            <Button size="small" onClick={onReportIssue}>
              Report Issue
            </Button>
          </Flex>

          <Title level={5}>Interval Records</Title>
          <Table<PackingIntervalRecord>
            size="small"
            rowKey="id"
            pagination={false}
            dataSource={records}
            style={{ marginBottom: 16 }}
            columns={[
              {
                title: 'Time',
                key: 'time',
                render: (_, r) => `${dayjs(r.from_time).format('HH:mm')}-${dayjs(r.to_time).format('HH:mm')}`,
              },
              { title: 'Plan', dataIndex: 'planned_output' },
              { title: '1st', dataIndex: 'premium_qty' },
              { title: '2nd', dataIndex: 'standard_qty' },
              { title: 'Rej', dataIndex: 'reject_qty' },
              { title: 'Packed', dataIndex: 'pieces_packed' },
              {
                title: '',
                key: 'flag',
                render: (_, r) => (r.is_late_entry ? <Tag color="warning">Late</Tag> : null),
              },
            ]}
            locale={{ emptyText: 'No intervals recorded yet.' }}
          />
        </>
      ) : (
        <Text type="secondary" style={{ display: 'block', marginBottom: 20 }}>
          No SKU assigned to this Work Centre right now.
        </Text>
      )}

      <Title level={5}>Queue</Title>
      {queue.length === 0 ? (
        <Text type="secondary">Nothing queued.</Text>
      ) : (
        queue.map((a) => (
          <Flex key={a.id} justify="space-between" align="center" style={{ marginBottom: 4 }}>
            <Text>
              {a.sequence}. {a.order_no} • {a.item_name} • {a.assigned_qty.toLocaleString()} pcs
            </Text>
            {!current && (
              <Button size="small" onClick={() => onStartAllocation(a.id)}>
                Start
              </Button>
            )}
          </Flex>
        ))
      )}

      <Button danger style={{ marginTop: 24 }} onClick={onStopWorkCentre}>
        Stop Work Centre
      </Button>
    </Drawer>
  )
}
