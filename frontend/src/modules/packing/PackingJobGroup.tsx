import type { ReactNode } from 'react'
import { Card, Empty, Flex, Typography } from 'antd'
import JobActionsCard from './JobActionsCard'
import WorkCentreTile from './WorkCentreTile'
import type { PackingJob, PackingWorkCentreSession } from './types'

const { Text } = Typography

/** One Packing Job's card on the job-first Packing Floor — spec v5 §5:
 * "Packing Floor is JOB-FIRST because Packing Head thinks in Packing
 * Jobs." Wraps the same `JobActionsCard` used everywhere else (so the
 * lifecycle actions/guards/events stay in one place), plus a nested
 * grid of just the Work Centre tiles currently doing *this* Job's work
 * — a Work Centre only appears here while its current (or held)
 * allocation belongs to this Job, not for a merely-queued-behind-it one.
 */
export default function PackingJobGroup({
  job,
  sessions,
  missingRecordMinutes,
  onChanged,
  onOpenDetail,
  onRecordHour,
  onRecordSummary,
  onAssignWork,
  onStartAllocation,
  onReportIssue,
  onStopWorkCentre,
  onResume,
  onAddWorkCentre,
  middleSlot,
  compact,
}: {
  job: PackingJob
  sessions: PackingWorkCentreSession[]
  missingRecordMinutes: number
  onChanged: () => void
  onOpenDetail: (session: PackingWorkCentreSession) => void
  onRecordHour: (session: PackingWorkCentreSession) => void
  onRecordSummary: (session: PackingWorkCentreSession) => void
  onAssignWork: (session: PackingWorkCentreSession) => void
  onStartAllocation: (allocationId: number) => void
  onReportIssue: (session: PackingWorkCentreSession) => void
  onStopWorkCentre: (session: PackingWorkCentreSession) => void
  onResume: (session: PackingWorkCentreSession) => void
  onAddWorkCentre: (job: PackingJob) => void
  /** Rendered between the Job's own action card and its Work Centres —
   * e.g. Material, which needs to be received before Work Centres get
   * allotted, so it reads before them rather than after. */
  middleSlot?: ReactNode
  /** Drops the Job identity header (number/product/bay/status) from the
   * action card — for when this already sits right under a row that's
   * showing all of that, e.g. Packing Floor's expanded Job row. */
  compact?: boolean
}) {
  return (
    <Card style={{ marginBottom: 16 }}>
      <JobActionsCard
        job={job}
        onChanged={onChanged}
        onAddWorkCentre={() => onAddWorkCentre(job)}
        compact={compact}
      />

      {middleSlot}

      <Text strong style={{ display: 'block', marginBottom: 8, textTransform: 'uppercase', fontSize: 12 }}>
        Work Centres
      </Text>
      {sessions.length === 0 ? (
        <Empty description="Not currently running on any Work Centre." image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <Flex gap={12} wrap="wrap">
          {sessions.map((session) => (
            <WorkCentreTile
              key={session.id}
              session={session}
              missingRecordMinutes={missingRecordMinutes}
              onOpenDetail={() => onOpenDetail(session)}
              onRecordHour={() => onRecordHour(session)}
              onRecordSummary={() => onRecordSummary(session)}
              onAssignWork={() => onAssignWork(session)}
              onStartAllocation={onStartAllocation}
              onReportIssue={() => onReportIssue(session)}
              onStopWorkCentre={() => onStopWorkCentre(session)}
              onResume={() => onResume(session)}
            />
          ))}
        </Flex>
      )}
    </Card>
  )
}
