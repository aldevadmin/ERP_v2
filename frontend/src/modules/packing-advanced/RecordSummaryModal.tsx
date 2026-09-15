import { useEffect, useState } from 'react'
import {
  Alert,
  Button,
  Descriptions,
  Divider,
  Flex,
  Input,
  InputNumber,
  Modal,
  Radio,
  Tag,
  Typography,
} from 'antd'
import { CheckCircleFilled } from '@ant-design/icons'
import { ApiError } from '../../shared/api/http'
import { getSummaryInfo, recordSummary } from './api'
import type { PackingWorkCentreAllocation, SummaryInfo } from './types'

const { Text } = Typography

export default function RecordSummaryModal({
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
  const [info, setInfo] = useState<SummaryInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isFinalSummary, setIsFinalSummary] = useState(false)

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
      setIsFinalSummary(false)
      setPremiumQty(null)
      setStandardQty(null)
      setRejectQty(null)
      setCleanedQty(null)
      setPouchesPacked(null)
      setLoosePiecesPacked(null)
      setCartonsCompleted(null)
      setRemarks('')
      setLoading(true)
      getSummaryInfo(allocation.id)
        .then(setInfo)
        .finally(() => setLoading(false))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, allocation?.id])

  if (!allocation) return null

  const total = (premiumQty ?? 0) + (standardQty ?? 0) + (rejectQty ?? 0)
  const isBalanced = total > 0
  const hasScheduleInfo = !!info && (info.entered_blocks.length > 0 || info.missing_blocks.length > 0)

  const handleSave = async () => {
    setError(null)
    setSubmitting(true)
    try {
      await recordSummary(allocation.id, {
        is_final_summary: isFinalSummary,
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
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this summary.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title={`Record Work Summary — ${allocation.work_centre_code}`}
      open={open}
      onCancel={onClose}
      footer={[
        <Button key="cancel" onClick={onClose}>
          Cancel
        </Button>,
        <Button key="save" type="primary" loading={submitting} onClick={() => void handleSave()}>
          Save Work Summary
        </Button>,
      ]}
      destroyOnHidden
      width={520}
    >
      <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>
        {allocation.job_number} • {allocation.order_no} • {allocation.item_name}
      </Text>
      {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}

      {hasScheduleInfo && (
        <Descriptions column={1} size="small" bordered style={{ marginBottom: 16, opacity: loading ? 0.5 : 1 }}>
          <Descriptions.Item label="Interval blocks entered">
            {info!.entered_blocks.length > 0 ? info!.entered_blocks.join(', ') : '—'}
          </Descriptions.Item>
          <Descriptions.Item label="Missing / unrecorded">
            {info!.missing_blocks.length > 0 ? info!.missing_blocks.join(', ') : '—'}
          </Descriptions.Item>
        </Descriptions>
      )}

      <Descriptions column={1} size="small" bordered style={{ marginBottom: 16 }}>
        <Descriptions.Item label="Assigned Qty">{allocation.assigned_qty.toLocaleString()}</Descriptions.Item>
      </Descriptions>

      <Radio.Group
        value={isFinalSummary}
        onChange={(e) => setIsFinalSummary(e.target.value as boolean)}
        style={{ display: 'block', marginBottom: 16 }}
      >
        <Flex vertical gap={4}>
          <Radio value={false}>Add summary for unrecorded output only</Radio>
          <Radio value={true}>Final consolidated summary (authorized correction)</Radio>
        </Flex>
      </Radio.Group>

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
