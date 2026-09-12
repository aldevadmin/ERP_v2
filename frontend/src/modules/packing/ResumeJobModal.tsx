import { useEffect, useState } from 'react'
import { Alert, Button, Checkbox, Modal, Typography } from 'antd'
import { ApiError } from '../../shared/api/http'
import { listJobAllocations, resumePackingJob } from './api'
import type { PackingJob, PackingWorkCentreAllocation } from './types'

const { Text } = Typography

export default function ResumeJobModal({
  open,
  job,
  onClose,
  onResumed,
  onAddWorkCentre,
}: {
  open: boolean
  job: PackingJob | null
  onClose: () => void
  onResumed: () => void
  /** Only meaningful on the Packing Floor (same restriction as
   * `JobActionsCard`'s own Add Work Centre button) — when this Job has
   * nothing left `ON_HOLD` to resume, offered as the way forward instead
   * of letting "Resume Job" silently flip the Job back to In Progress
   * with nothing actually running anywhere. */
  onAddWorkCentre?: () => void
}) {
  const [allocations, setAllocations] = useState<PackingWorkCentreAllocation[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [loaded, setLoaded] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open && job) {
      setError(null)
      setLoaded(false)
      listJobAllocations(job.id).then((rows) => {
        const held = rows.filter((a) => a.status === 'ON_HOLD')
        setAllocations(held)
        setSelected(new Set(held.map((a) => a.id)))
        setLoaded(true)
      })
    }
  }, [open, job])

  if (!job) return null

  const toggle = (id: number, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const handleSubmit = async () => {
    setError(null)
    setSubmitting(true)
    try {
      await resumePackingJob(job.id, Array.from(selected))
      onResumed()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not resume this Job.')
    } finally {
      setSubmitting(false)
    }
  }

  // Nothing to bring back — Resume would otherwise just flip the Job's
  // status to In Progress with no allocation anywhere to show for it, an
  // orphaned state that's confusing to spot after the fact. Redirect to
  // Add Work Centre instead of allowing that no-op.
  const nothingToResume = loaded && allocations.length === 0

  return (
    <Modal
      title={`Resume ${job.job_number}`}
      open={open}
      onCancel={onClose}
      destroyOnHidden
      footer={
        nothingToResume
          ? [
              <Button key="cancel" onClick={onClose}>
                Close
              </Button>,
              onAddWorkCentre && (
                <Button
                  key="add"
                  type="primary"
                  onClick={() => {
                    onClose()
                    onAddWorkCentre()
                  }}
                >
                  Add Work Centre
                </Button>
              ),
            ]
          : undefined
      }
      onOk={() => void handleSubmit()}
      confirmLoading={submitting}
      okText="Resume Job"
      okButtonProps={{ disabled: !loaded || allocations.length === 0 }}
    >
      {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}
      {nothingToResume ? (
        <Text type="secondary">
          Nothing is reserved for this Job to resume — its Work Centres were freed for other work
          when it was paused.{' '}
          {onAddWorkCentre
            ? 'Add a Work Centre to restart it.'
            : 'Add a Work Centre from the Packing Floor to restart it.'}
        </Text>
      ) : (
        <>
          <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
            Select which Work Centres to bring back. Any that picked up other work while paused
            will queue behind it instead of interrupting it.
          </Text>
          {allocations.map((a) => (
            <div key={a.id} style={{ marginBottom: 8 }}>
              <Checkbox
                checked={selected.has(a.id)}
                onChange={(e) => toggle(a.id, e.target.checked)}
              >
                {a.work_centre_code} — {a.item_name} ({a.assigned_qty.toLocaleString()} pcs)
              </Checkbox>
            </div>
          ))}
        </>
      )}
    </Modal>
  )
}
