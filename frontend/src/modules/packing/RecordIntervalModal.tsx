import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Descriptions, Divider, Flex, Input, InputNumber, Modal, Tag, Typography } from 'antd'
import { CheckCircleFilled } from '@ant-design/icons'
import dayjs from 'dayjs'
import { ApiError } from '../../shared/api/http'
import { getNextInterval, recordInterval } from './api'
import type { PackingWorkCentreAllocation } from './types'

const { Text } = Typography

export default function RecordIntervalModal({
  open,
  allocation,
  onClose,
  onSaved,
}: {
  open: boolean
  allocation: PackingWorkCentreAllocation | null
  onClose: () => void
  onSaved: () => void
}) {
  const [fromTime, setFromTime] = useState<string | null>(null)
  const [toTime, setToTime] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [premiumQty, setPremiumQty] = useState<number | null>(null)
  const [standardQty, setStandardQty] = useState<number | null>(null)
  const [rejectQty, setRejectQty] = useState<number | null>(null)
  const [cleanedQty, setCleanedQty] = useState<number | null>(null)
  const [pouchesPacked, setPouchesPacked] = useState<number | null>(null)
  const [loosePiecesPacked, setLoosePiecesPacked] = useState<number | null>(null)
  const [cartonsCompleted, setCartonsCompleted] = useState<number | null>(null)
  const [remarks, setRemarks] = useState('')

  useEffect(() => {
    if (open && allocation) {
      setError(null)
      setPremiumQty(null)
      setStandardQty(null)
      setRejectQty(null)
      setCleanedQty(null)
      setPouchesPacked(null)
      setLoosePiecesPacked(null)
      setCartonsCompleted(null)
      setRemarks('')
      setLoading(true)
      getNextInterval(allocation.id)
        .then((r) => {
          setFromTime(r.from_time)
          setToTime(r.to_time)
        })
        .finally(() => setLoading(false))
    }
  }, [open, allocation])

  const total = (premiumQty ?? 0) + (standardQty ?? 0) + (rejectQty ?? 0)
  const isBalanced = total > 0

  const scheduledMinutes = useMemo(
    () => (fromTime && toTime ? dayjs(toTime).diff(dayjs(fromTime), 'minute') : 0),
    [fromTime, toTime],
  )

  if (!allocation) return null

  const handleSave = async (andNext: boolean) => {
    if (!fromTime || !toTime) return
    setError(null)
    setSubmitting(true)
    try {
      await recordInterval(allocation.id, {
        from_time: fromTime,
        to_time: toTime,
        premium_qty: premiumQty ?? 0,
        standard_qty: standardQty ?? 0,
        reject_qty: rejectQty ?? 0,
        cleaned_qty: cleanedQty ?? 0,
        pouches_packed: pouchesPacked ?? 0,
        loose_pieces_packed: loosePiecesPacked ?? 0,
        cartons_completed: cartonsCompleted ?? 0,
        remarks,
      })
      onSaved()
      if (!andNext) onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this interval.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title={`Record Hour — ${allocation.work_centre_code}`}
      open={open}
      onCancel={onClose}
      footer={[
        <Button key="cancel" onClick={onClose}>
          Cancel
        </Button>,
        <Button key="save" loading={submitting} onClick={() => void handleSave(false)}>
          Save
        </Button>,
        <Button key="next" type="primary" loading={submitting} onClick={() => void handleSave(true)}>
          Save & Next Work Centre
        </Button>,
      ]}
      destroyOnHidden
      width={520}
    >
      <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>
        {allocation.order_no} • {allocation.item_name}
      </Text>
      {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}

      <Descriptions column={2} size="small" bordered style={{ marginBottom: 16, opacity: loading ? 0.5 : 1 }}>
        <Descriptions.Item label="From">{fromTime ? dayjs(fromTime).format('HH:mm') : '—'}</Descriptions.Item>
        <Descriptions.Item label="To">{toTime ? dayjs(toTime).format('HH:mm') : '—'}</Descriptions.Item>
        <Descriptions.Item label="Scheduled">{scheduledMinutes} min</Descriptions.Item>
        <Descriptions.Item label="Assigned Qty">{allocation.assigned_qty.toLocaleString()}</Descriptions.Item>
      </Descriptions>

      <Text strong style={{ display: 'block', marginBottom: 8 }}>
        SORTING OUTPUT
      </Text>
      <Flex vertical gap={8} style={{ marginBottom: 16 }}>
        <Flex justify="space-between" align="center">
          <Text>Premium / 1st</Text>
          <InputNumber min={0} style={{ width: 140 }} value={premiumQty} onChange={setPremiumQty} />
        </Flex>
        <Flex justify="space-between" align="center">
          <Text>Standard / 2nd</Text>
          <InputNumber min={0} style={{ width: 140 }} value={standardQty} onChange={setStandardQty} />
        </Flex>
        <Flex justify="space-between" align="center">
          <Text>Reject</Text>
          <InputNumber min={0} style={{ width: 140 }} value={rejectQty} onChange={setRejectQty} />
        </Flex>
        <Flex justify="space-between" align="center" style={{ borderTop: '1px solid #f0f0f0', paddingTop: 8 }}>
          <Text strong>Total</Text>
          <Flex align="center" gap={8}>
            <Text strong>{total.toLocaleString()}</Text>
            {isBalanced && (
              <Tag color="success" icon={<CheckCircleFilled />}>
                Balanced
              </Tag>
            )}
          </Flex>
        </Flex>
      </Flex>

      <Text strong style={{ display: 'block', marginBottom: 8 }}>
        CLEANING
      </Text>
      <Flex justify="space-between" align="center" style={{ marginBottom: 16 }}>
        <Text>Cleaned Qty</Text>
        <InputNumber min={0} style={{ width: 140 }} value={cleanedQty} onChange={setCleanedQty} />
      </Flex>

      <Text strong style={{ display: 'block', marginBottom: 8 }}>
        PACKING
      </Text>
      <Flex vertical gap={8} style={{ marginBottom: 16 }}>
        <Flex justify="space-between" align="center">
          <Text>Pouches Packed</Text>
          <InputNumber min={0} style={{ width: 140 }} value={pouchesPacked} onChange={setPouchesPacked} />
        </Flex>
        <Flex justify="space-between" align="center">
          <Text>Loose Pieces Packed</Text>
          <InputNumber
            min={0}
            style={{ width: 140 }}
            value={loosePiecesPacked}
            onChange={setLoosePiecesPacked}
          />
        </Flex>
        <Flex justify="space-between" align="center">
          <Text>Cartons Completed</Text>
          <InputNumber min={0} style={{ width: 140 }} value={cartonsCompleted} onChange={setCartonsCompleted} />
        </Flex>
      </Flex>

      <Divider style={{ margin: '8px 0' }} />
      <Text style={{ display: 'block', marginBottom: 4 }}>Remarks</Text>
      <Input.TextArea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
    </Modal>
  )
}
