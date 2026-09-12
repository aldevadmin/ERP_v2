import { Button, Card, Dropdown, Progress, Space, Tag, Typography } from 'antd'
import { DownOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
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
  onRecordSummary,
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
  onRecordSummary: () => void
  onAssignWork: () => void
  onStartAllocation: (allocationId: number) => void
  onReportIssue: () => void
  onStopWorkCentre: () => void
  onResume: () => void
}) {
  const current = session.allocations.find((a) => a.id === session.current_allocation_id) ?? null
  const queued = current
    ? null
    : session.allocations.filter((a) => a.status === 'PLANNED').sort((a, b) => a.sequence - b.sequence)[0] ?? null
  // A Job paused with "keep Work Centres reserved" leaves its allocation
  // ON_HOLD rather than PLANNED — it's not next-in-queue, it's waiting on
  // that Job's own Resume. Without this, the tile looks identical to one
  // that was never assigned to anyone.
  const held =
    current || queued
      ? null
      : session.allocations.filter((a) => a.status === 'ON_HOLD').sort((a, b) => a.sequence - b.sequence)[0] ?? null
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
        <Tag color={held ? 'purple' : STATUS_COLORS[session.status]}>{held ? 'RESERVED' : session.status}</Tag>
      </div>
      <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
        {session.operators.map((o) => o.employee_name).join(' + ') || 'No operators'}
      </Text>

      {current ? (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 8 }}>
            <span>Assigned {current.assigned_qty.toLocaleString()}</span>
            <span>Packed {current.packed_qty.toLocaleString()}</span>
          </div>
          <Progress percent={progress} size="small" showInfo={false} />
        </>
      ) : queued ? (
        <div style={{ padding: '8px 0' }}>
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
            Assigned {queued.assigned_qty.toLocaleString()}
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
      ) : held ? (
        <div style={{ padding: '8px 0' }}>
          <Text style={{ fontSize: 12, display: 'block', marginBottom: 2 }}>
            {held.job_number} — {held.item_name}
          </Text>
          <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
            Assigned {held.assigned_qty.toLocaleString()} · Job is paused
          </Text>
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
          <Space.Compact size="small">
            <Button size="small" onClick={onRecordHour}>
              Record Output
            </Button>
            <Dropdown
              trigger={['click']}
              menu={{
                items: [
                  { key: 'interval', label: 'Record Interval' },
                  { key: 'summary', label: 'Record Summary' },
                  { key: 'view', label: 'View Records' },
                ],
                onClick: ({ key }) => {
                  if (key === 'interval') onRecordHour()
                  if (key === 'summary') onRecordSummary()
                  if (key === 'view') onOpenDetail()
                },
              }}
            >
              <Button size="small" icon={<DownOutlined />} />
            </Dropdown>
          </Space.Compact>
        ) : (
          <span />
        )}
        <Dropdown trigger={['click']} menu={{ items: menuItems, onClick: ({ key }) => handleMenuClick(key) }}>
          <Button size="small" icon={<DownOutlined />} />
        </Dropdown>
      </div>
    </Card>
  )
}
