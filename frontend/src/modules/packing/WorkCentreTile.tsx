import { Button, Card, Dropdown, Progress, Tag, Typography } from 'antd'
import { DownOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useNavigate } from 'react-router'
import type { PackingWorkCentreSession } from './types'

const { Text } = Typography

const STATUS_COLORS: Record<PackingWorkCentreSession['status'], string> = {
  RUNNING: 'green',
  IDLE: 'default',
  ISSUE: 'orange',
  STOPPED: 'default',
}

export default function WorkCentreTile({
  session,
  missingRecordMinutes,
  onOpenDetail,
  onRecordHour,
  onAssignWork,
  onStartAllocation,
  onReportIssue,
  onStopWorkCentre,
  onResume,
}: {
  session: PackingWorkCentreSession
  missingRecordMinutes: number
  onOpenDetail: () => void
  onRecordHour: () => void
  onAssignWork: () => void
  onStartAllocation: (allocationId: number) => void
  onReportIssue: () => void
  onStopWorkCentre: () => void
  onResume: () => void
}) {
  const navigate = useNavigate()
  const current = session.allocations.find((a) => a.id === session.current_allocation_id) ?? null
  const queued = current
    ? null
    : session.allocations.filter((a) => a.status === 'PLANNED').sort((a, b) => a.sequence - b.sequence)[0] ?? null
  const progress = current ? Math.round((current.processed_qty / (current.assigned_qty || 1)) * 100) : 0

  const nextExpectedOverdue =
    session.status === 'RUNNING' &&
    current &&
    current.started_at &&
    dayjs().diff(dayjs(current.started_at), 'minute') > missingRecordMinutes

  const menuItems = [
    { key: 'detail', label: 'View Details' },
    ...(current ? [{ key: 'change-sku', label: 'Change SKU / Start Next' }] : []),
    { key: 'issue', label: 'Report Issue', disabled: session.status === 'STOPPED' },
    { key: 'stop', label: 'Stop Work Centre', disabled: session.status === 'STOPPED' },
  ]

  const openJob = (jobId: number) => {
    navigate(`/packing/jobs/${jobId}`, {
      state: { from: { label: 'Packing Floor', path: '/packing/today' } },
    })
  }

  const handleMenuClick = (key: string) => {
    if (key === 'detail' || key === 'change-sku') onOpenDetail()
    if (key === 'issue') onReportIssue()
    if (key === 'stop') onStopWorkCentre()
  }

  return (
    <Card
      size="small"
      style={{ width: 260 }}
      styles={{ body: { padding: 12 } }}
      onClick={onOpenDetail}
      hoverable
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <Text strong>{session.work_centre_code}</Text>
        <Tag color={STATUS_COLORS[session.status]}>{session.status}</Tag>
      </div>
      <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
        {session.operators.map((o) => o.employee_name).join(' + ') || 'No operators'}
      </Text>

      {current ? (
        <>
          <Text style={{ display: 'block' }}>{current.item_name}</Text>
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
            {current.order_no} •{' '}
            <Button
              type="link"
              size="small"
              style={{ padding: 0, height: 'auto', fontSize: 12 }}
              onClick={(e) => {
                e.stopPropagation()
                openJob(current.job)
              }}
            >
              {current.job_number}
            </Button>
          </Text>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
            <span>Assigned {current.assigned_qty.toLocaleString()}</span>
            <span>Packed {current.packed_qty.toLocaleString()}</span>
          </div>
          <Progress percent={progress} size="small" showInfo={false} />
        </>
      ) : queued ? (
        <div style={{ padding: '8px 0' }}>
          <Text style={{ display: 'block' }}>{queued.item_name}</Text>
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
            <Button
              type="link"
              size="small"
              style={{ padding: 0, height: 'auto', fontSize: 12 }}
              onClick={(e) => {
                e.stopPropagation()
                openJob(queued.job)
              }}
            >
              {queued.job_number}
            </Button>{' '}
            • Assigned {queued.assigned_qty.toLocaleString()}
          </Text>
          {session.status !== 'STOPPED' && session.status !== 'ISSUE' && (
            <Button
              size="small"
              type="primary"
              onClick={(e) => {
                e.stopPropagation()
                onStartAllocation(queued.id)
              }}
            >
              Start
            </Button>
          )}
        </div>
      ) : (
        <div style={{ padding: '12px 0' }}>
          <Text type="secondary">No SKU assigned</Text>
          {session.status !== 'STOPPED' && session.status !== 'ISSUE' && (
            <Button
              size="small"
              type="link"
              style={{ padding: 0, display: 'block' }}
              onClick={(e) => {
                e.stopPropagation()
                onAssignWork()
              }}
            >
              Assign Work
            </Button>
          )}
        </div>
      )}

      {session.status === 'ISSUE' && session.open_issue && (
        <Text type="warning" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
          Issue: {session.open_issue.description || session.open_issue.issue_type}
        </Text>
      )}

      {nextExpectedOverdue && (
        <Text type="warning" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
          ⚠ Hour due
        </Text>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }} onClick={(e) => e.stopPropagation()}>
        {session.status === 'ISSUE' ? (
          <Button size="small" onClick={onResume}>
            Resume
          </Button>
        ) : current ? (
          <Button size="small" onClick={onRecordHour}>
            Record Hour
          </Button>
        ) : (
          <span />
        )}
        <Dropdown menu={{ items: menuItems, onClick: ({ key }) => handleMenuClick(key) }}>
          <Button size="small" icon={<DownOutlined />} />
        </Dropdown>
      </div>
    </Card>
  )
}
