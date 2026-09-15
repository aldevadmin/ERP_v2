import { useState } from 'react'
import { Alert, Modal, Table, Typography, message } from 'antd'
import dayjs from 'dayjs'
import { ApiError } from '../../shared/api/http'
import { closeToday } from './api'
import type { DayReconciliationRow } from './types'

const { Text } = Typography

/** Review-then-confirm for ending a day — Allotted vs. what's actually
 * been recorded per Job, so a shortfall is something the Planner
 * consciously closes over, not something that silently disappears.
 * Closing doesn't change any of these numbers; it just locks the date
 * (see `services.close_pending_day`) — no more Add Records against it,
 * and no new work Released for a later date until this one has a
 * closure row. `date` is whichever date is actually being closed —
 * normally today, but an overdue earlier date if one was missed (see
 * `services.date_to_close`), so this never silently assumes "today."
 */
export default function CloseTodayModal({
  open,
  date,
  rows,
  onClose,
  onClosed,
}: {
  open: boolean
  date: string | null
  rows: DayReconciliationRow[]
  onClose: () => void
  onClosed: () => void
}) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleConfirm = async () => {
    setError(null)
    setSubmitting(true)
    try {
      await closeToday()
      message.success(`${date ? dayjs(date).format('DD MMM YYYY') : "Today's"} work is closed.`)
      onClosed()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not close this day's work.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title={date ? `Close ${dayjs(date).format('DD MMM YYYY')}` : "Close Today's Work"}
      open={open}
      onCancel={onClose}
      onOk={() => void handleConfirm()}
      confirmLoading={submitting}
      okText="Confirm Close"
      width={720}
    >
      {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}
      <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
        Once closed, no more records can be added for this date, and no later date's work can be
        released until this is closed.
      </Text>
      <Table<DayReconciliationRow>
        rowKey="id"
        size="small"
        dataSource={rows}
        pagination={false}
        locale={{ emptyText: 'Nothing released to the packing floor today.' }}
        columns={[
          { title: 'Job ID', dataIndex: 'job_id' },
          { title: 'SKU', dataIndex: 'customer_sku_code' },
          {
            title: 'Allotted (plates)',
            dataIndex: 'allotted_plates',
            align: 'right',
            render: (v: number | null) => (v ?? '—').toLocaleString(),
          },
          {
            title: 'Recorded (plates)',
            dataIndex: 'recorded_plates',
            align: 'right',
            render: (v: number) => v.toLocaleString(),
          },
          {
            title: 'Shortfall',
            dataIndex: 'shortfall_plates',
            align: 'right',
            render: (v: number | null) => {
              if (v === null) return '—'
              const label = v > 0 ? `${v.toLocaleString()} short` : v < 0 ? `${Math.abs(v).toLocaleString()} over` : 'On target'
              return <Text type={v > 0 ? 'danger' : v < 0 ? 'warning' : 'secondary'}>{label}</Text>
            },
          },
          {
            title: 'Boxes (Recorded / Expected)',
            key: 'boxing',
            align: 'right',
            render: (_, row) => {
              if (row.expected_boxes === null || row.boxing_discrepancy === null) {
                return <Text type="secondary">—</Text>
              }
              const mismatch = row.boxing_discrepancy !== 0
              return (
                <Text type={mismatch ? 'warning' : 'secondary'}>
                  {row.boxes_packed.toLocaleString()} / {row.expected_boxes.toLocaleString()}
                  {mismatch &&
                    ` (${row.boxing_discrepancy > 0 ? '+' : ''}${row.boxing_discrepancy.toLocaleString()})`}
                </Text>
              )
            },
          },
        ]}
      />
      <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
        Boxes vs. expected is a soft check against pouches recorded — a mismatch is logged for later
        review, not blocked.
      </Text>
    </Modal>
  )
}
