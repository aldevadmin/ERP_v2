import { type ReactNode, useState } from 'react'
import { Button, Card, Flex, Tag, Tooltip, Typography, message } from 'antd'
import {
  CheckOutlined,
  CloseOutlined,
  FileTextOutlined,
  PauseOutlined,
  PlusOutlined,
  CaretRightOutlined,
  PictureOutlined,
  ScheduleOutlined,
  StopOutlined,
} from '@ant-design/icons'
import { ApiError } from '../../shared/api/http'
import { completePackingJob } from './api'
import BulkSummaryModal from './BulkSummaryModal'
import CancelJobModal from './CancelJobModal'
import PauseJobModal from './PauseJobModal'
import RescheduleModal, { type ReschedulableLine } from './RescheduleModal'
import ResumeJobModal from './ResumeJobModal'
import StopJobModal from './StopJobModal'
import type { PackingJob, PackingJobStatus } from './types'

const { Title, Text } = Typography

const STATUS_COLORS: Record<PackingJobStatus, string> = {
  AWAITING_MATERIAL: 'default',
  READY: 'blue',
  IN_PROGRESS: 'processing',
  COMPLETED: 'green',
  ON_HOLD: 'orange',
  STOPPED: 'default',
  CANCELLED: 'red',
}

/** The rich Job identity + stats + lifecycle-action card, shared by the
 * standalone Job Overview page and Packing Floor's "Focused Job" panel.
 * `extra` lets a hosting page slot in its own page-specific link
 * (e.g. "View on Packing Floor") without this component knowing about it.
 */
export default function JobActionsCard({
  job,
  onChanged,
  extra,
  onAddWorkCentre,
  compact,
}: {
  job: PackingJob
  onChanged: () => void
  extra?: ReactNode
  /** Only meaningful on the Packing Floor, which owns today's shift
   * context (`AddWorkCentreModal` needs the date/shift/sessions) — omit
   * this to hide the button entirely, e.g. on the standalone Job
   * Overview page. */
  onAddWorkCentre?: () => void
  /** Drops the Job number/product/bay/status identity block — for when a
   * hosting page already shows all of that right above this card (e.g.
   * Packing Floor's expanded Job row), so it isn't repeated. */
  compact?: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [rescheduling, setRescheduling] = useState(false)
  const [pausing, setPausing] = useState(false)
  const [resuming, setResuming] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [bulkSummarizing, setBulkSummarizing] = useState(false)

  const isClosed = ['COMPLETED', 'CANCELLED', 'STOPPED'].includes(job.status)
  const cancelBlockReason = job.has_running_allocation
    ? 'This Job is running on the floor right now — stop it first.'
    : undefined
  const awaitingMaterial = job.status === 'AWAITING_MATERIAL'
  const addWorkCentreBlockReason = awaitingMaterial
    ? 'Material must be received before allocating a Work Centre to this Job.'
    : undefined
  const rescheduleBlockReason = !job.can_reschedule
    ? 'This Job’s plan was already returned to demand — re-plan it fresh from Weekly Planner instead.'
    : undefined

  // Pause/Complete/Stop/Reschedule cascade into whatever's running on the
  // floor rather than requiring it to be stopped first — only Cancel keeps
  // the "stop it first" guard (it isn't a valid action on a RUNNING Job).
  const canHold = !isClosed && job.status !== 'ON_HOLD'
  const canResume = job.status === 'ON_HOLD'
  const canComplete = !isClosed
  const canCancel = !isClosed && !job.has_running_allocation
  const canStop = job.status === 'IN_PROGRESS' || job.status === 'ON_HOLD'

  const reschedulableLine: ReschedulableLine = {
    id: job.plan_line,
    plan_code: job.plan_code,
    date: job.date,
    shift: job.shift,
    bay: job.bay,
    has_job: true,
    job_target_qty: job.target_qty,
    job_packed_qty: job.packed_qty,
  }

  const run = async (action: () => Promise<unknown>, failureMessage: string) => {
    setBusy(true)
    try {
      await action()
      onChanged()
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : failureMessage)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card style={{ marginBottom: 16 }}>
      <Flex align="flex-start" wrap="wrap" gap={24}>
        {!compact && (
          <div>
            <Tag color={STATUS_COLORS[job.status]} style={{ marginBottom: 8 }}>
              {job.status.replace('_', ' ')}
            </Tag>
            <Title level={4} style={{ margin: 0 }}>
              {job.job_number}
            </Title>
            <Text type="secondary">
              {job.order_no} • {job.customer_name}
            </Text>
          </div>
        )}

        <Flex vertical gap={2}>
          {!compact && (
            <>
              <Text type="secondary">Product</Text>
              <Text strong>{job.item_name}</Text>
            </>
          )}
          <Flex gap={24} style={{ marginTop: compact ? 0 : 4 }}>
            <div>
              <Text type="secondary">SKU</Text>
              <div>
                <Text strong>{job.customer_sku_code || '—'}</Text>
              </div>
            </div>
            <div>
              <Text type="secondary">Packaging Profile</Text>
              <div>
                <Text strong>{job.packaging_profile_label ?? '—'}</Text>
              </div>
            </div>
          </Flex>
        </Flex>

        <div>
          <Text type="secondary">Planned Date</Text>
          <div>
            <Text strong>{job.date}</Text>
          </div>
        </div>
        <div>
          <Text type="secondary">Shift</Text>
          <div>
            <Text strong>{job.shift_name}</Text>
          </div>
        </div>
        {!compact && (
          <div>
            <Text type="secondary">Bay</Text>
            <div>
              <Text strong>{job.bay_name}</Text>
            </div>
          </div>
        )}
        <div>
          <Text type="secondary">Target Quantity</Text>
          <div>
            <Text strong>{job.target_qty.toLocaleString()} pcs</Text>
          </div>
        </div>
        <div>
          <Text type="secondary">Packed</Text>
          <div>
            <Text strong>{job.packed_qty.toLocaleString()} pcs</Text>
          </div>
        </div>
        <div>
          <Text type="secondary">Balance</Text>
          <div>
            <Text strong>{job.balance_qty.toLocaleString()} pcs</Text>
          </div>
        </div>
        <div>
          <Text type="secondary">Standard</Text>
          <div>
            <Text strong>{job.standard_qty.toLocaleString()} pcs</Text>
          </div>
        </div>
        <div>
          <Text type="secondary">Reject</Text>
          <div>
            <Text strong>{job.reject_qty.toLocaleString()} pcs</Text>
          </div>
        </div>

        {extra}

        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 8,
            background: '#fafafa',
            border: '1px dashed #d9d9d9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            marginLeft: 'auto',
          }}
        >
          <PictureOutlined style={{ fontSize: 24, color: '#bfbfbf' }} />
        </div>

        <Flex gap={8} wrap="wrap">
          {onAddWorkCentre && (
            <Tooltip title={addWorkCentreBlockReason}>
              <span>
                <Button
                  icon={<PlusOutlined />}
                  disabled={isClosed || job.status === 'ON_HOLD' || awaitingMaterial || busy}
                  onClick={onAddWorkCentre}
                >
                  Add Work Centre
                </Button>
              </span>
            </Tooltip>
          )}
          <Button
            icon={<PauseOutlined />}
            disabled={!canHold || busy}
            onClick={() => setPausing(true)}
          >
            Pause
          </Button>
          <Button
            icon={<CaretRightOutlined />}
            disabled={!canResume || busy}
            onClick={() => setResuming(true)}
          >
            Resume
          </Button>
          <Button
            icon={<CheckOutlined />}
            disabled={!canComplete || busy}
            onClick={() => void run(() => completePackingJob(job.id), 'Could not complete this Job.')}
          >
            Complete Job
          </Button>
          <Button
            icon={<StopOutlined />}
            disabled={!canStop || busy}
            onClick={() => setStopping(true)}
          >
            Stop Job
          </Button>
          <Tooltip title={cancelBlockReason}>
            <span>
              <Button
                danger
                icon={<CloseOutlined />}
                disabled={!canCancel || busy}
                onClick={() => setCancelling(true)}
              >
                Cancel Job
              </Button>
            </span>
          </Tooltip>
          <Tooltip title={rescheduleBlockReason}>
            <span>
              <Button
                type="primary"
                icon={<ScheduleOutlined />}
                disabled={busy || !job.can_reschedule}
                onClick={() => setRescheduling(true)}
              >
                Reschedule
              </Button>
            </span>
          </Tooltip>
          <Button
            icon={<FileTextOutlined />}
            disabled={busy}
            onClick={() => setBulkSummarizing(true)}
          >
            Bulk Summary
          </Button>
        </Flex>
      </Flex>

      <CancelJobModal
        open={cancelling}
        job={job}
        onClose={() => setCancelling(false)}
        onCancelled={() => {
          setCancelling(false)
          onChanged()
        }}
      />
      <RescheduleModal
        open={rescheduling}
        line={reschedulableLine}
        onClose={() => setRescheduling(false)}
        onRescheduled={() => {
          setRescheduling(false)
          onChanged()
        }}
      />
      <PauseJobModal
        open={pausing}
        job={job}
        onClose={() => setPausing(false)}
        onPaused={() => {
          setPausing(false)
          onChanged()
        }}
      />
      <ResumeJobModal
        open={resuming}
        job={job}
        onClose={() => setResuming(false)}
        onAddWorkCentre={onAddWorkCentre}
        onResumed={() => {
          setResuming(false)
          onChanged()
        }}
      />
      <StopJobModal
        open={stopping}
        job={job}
        onClose={() => setStopping(false)}
        onStopped={() => {
          setStopping(false)
          onChanged()
        }}
      />
      <BulkSummaryModal
        open={bulkSummarizing}
        job={job}
        onClose={() => setBulkSummarizing(false)}
        onSaved={() => {
          setBulkSummarizing(false)
          onChanged()
        }}
      />
    </Card>
  )
}
