import { useEffect, useState } from 'react'
import { Alert, Descriptions, Modal, Radio } from 'antd'
import { ApiError } from '../../shared/api/http'
import { stopWorkCentreSession } from './api'
import type { PackingWorkCentreSession } from './types'

const REASONS = [
  { value: 'End of Shift', label: 'End of Shift' },
  { value: 'Work Centre Issue', label: 'Work Centre Issue' },
  { value: 'Operator unavailable', label: 'Operator unavailable' },
  { value: 'Other', label: 'Other' },
]

export default function StopWorkCentreModal({
  open,
  session,
  onClose,
  onStopped,
}: {
  open: boolean
  session: PackingWorkCentreSession | null
  onClose: () => void
  onStopped: () => void
}) {
  const [reason, setReason] = useState('End of Shift')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setReason('End of Shift')
      setError(null)
    }
  }, [open])

  if (!session) return null

  const packedTotal = session.allocations.reduce((sum, a) => sum + a.packed_qty, 0)

  const handleStop = async () => {
    setError(null)
    setSubmitting(true)
    try {
      await stopWorkCentreSession(session.id, reason)
      onStopped()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not stop this Work Centre.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title="Stop Work Centre"
      open={open}
      onCancel={onClose}
      onOk={() => void handleStop()}
      confirmLoading={submitting}
      okText="Stop"
      okButtonProps={{ danger: true }}
      destroyOnHidden
    >
      {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}
      <Descriptions column={1} size="small" style={{ marginBottom: 16 }}>
        <Descriptions.Item label="Work Centre">
          {session.work_centre_code} — {session.operators.map((o) => o.employee_name).join(' + ')}
        </Descriptions.Item>
        <Descriptions.Item label="Running since">
          {session.started_at ? new Date(session.started_at).toLocaleTimeString() : '—'}
        </Descriptions.Item>
        <Descriptions.Item label="Packed">{packedTotal.toLocaleString()} pcs</Descriptions.Item>
      </Descriptions>
      <Radio.Group
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        options={REASONS}
        style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
      />
    </Modal>
  )
}
