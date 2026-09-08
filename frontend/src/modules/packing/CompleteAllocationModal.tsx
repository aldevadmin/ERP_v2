import { useState } from 'react'
import { Alert, Button, Descriptions, Divider, Modal, Typography } from 'antd'
import { ApiError } from '../../shared/api/http'
import { completeAllocation, startAllocation } from './api'
import type { PackingWorkCentreSession } from './types'

const { Text } = Typography

export default function CompleteAllocationModal({
  open,
  session,
  onClose,
  onChanged,
  onAssignWork,
}: {
  open: boolean
  session: PackingWorkCentreSession | null
  onClose: () => void
  onChanged: () => void
  onAssignWork: () => void
}) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!session) return null

  const current = session.allocations.find((a) => a.id === session.current_allocation_id) ?? null
  const next = session.allocations
    .filter((a) => a.status === 'PLANNED')
    .sort((a, b) => a.sequence - b.sequence)[0]

  const handleComplete = async () => {
    if (!current) return
    setError(null)
    setSubmitting(true)
    try {
      await completeAllocation(current.id)
      onChanged()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not complete this SKU.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleStartNext = async () => {
    if (!next) return
    setError(null)
    setSubmitting(true)
    try {
      await startAllocation(next.id)
      onChanged()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start the next SKU.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal title="Complete Current Work" open={open} onCancel={onClose} footer={null} destroyOnHidden>
      {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}

      {current ? (
        <>
          <Text strong style={{ display: 'block', marginBottom: 4 }}>
            Current
          </Text>
          <Descriptions column={1} size="small" bordered style={{ marginBottom: 12 }}>
            <Descriptions.Item label={`${current.order_no} • ${current.item_name}`}>
              Assigned {current.assigned_qty.toLocaleString()} • Packed {current.packed_qty.toLocaleString()}{' '}
              • Balance {current.balance_qty.toLocaleString()}
            </Descriptions.Item>
          </Descriptions>
          <Button block loading={submitting} onClick={() => void handleComplete()}>
            Complete Current SKU
          </Button>
        </>
      ) : (
        <Text type="secondary">No SKU is currently running on this Work Centre.</Text>
      )}

      <Divider />

      <Text strong style={{ display: 'block', marginBottom: 4 }}>
        NEXT
      </Text>
      {next ? (
        <>
          <Descriptions column={1} size="small" bordered style={{ marginBottom: 12 }}>
            <Descriptions.Item label={`${next.order_no} • ${next.item_name}`}>
              Assigned: {next.assigned_qty.toLocaleString()}
            </Descriptions.Item>
          </Descriptions>
          <Button
            block
            type="primary"
            loading={submitting}
            disabled={!!current}
            onClick={() => void handleStartNext()}
          >
            Start Next Work
          </Button>
        </>
      ) : (
        <>
          <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
            Nothing queued yet.
          </Text>
          <Button block onClick={onAssignWork}>
            Assign Work
          </Button>
        </>
      )}
    </Modal>
  )
}
