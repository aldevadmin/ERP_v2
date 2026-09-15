import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Button,
  Card,
  DatePicker,
  Flex,
  Progress,
  Segmented,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd'
import { WarningOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { useSearchParams } from 'react-router'
import { ApiError } from '../../shared/api/http'
import AddWorkCentreModal from './AddWorkCentreModal'
import AssignWorkModal from './AssignWorkModal'
import CompleteAllocationModal from './CompleteAllocationModal'
import PackingJobGroup from './PackingJobGroup'
import RecordIntervalModal from './RecordIntervalModal'
import RecordSummaryModal from './RecordSummaryModal'
import ReportIssueModal from './ReportIssueModal'
import StopWorkCentreModal from './StopWorkCentreModal'
import {
  getExecutionConfig,
  getPackingJob,
  getTodaysShift,
  listShifts,
  resumeWorkCentreSession,
  startAllocation,
  stopPackingShift,
} from './api'
import JobDetailTabs from './JobDetailTabs'
import JobMaterialSection from './JobMaterialSection'
import type {
  PackingExecutionConfig,
  PackingJob,
  PackingShift,
  PackingWorkCentreAllocation,
  PackingWorkCentreSession,
  Shift,
} from './types'
import WorkCentreDetailDrawer from './WorkCentreDetailDrawer'

const { Title, Text } = Typography

type JobBucket = 'UNASSIGNED' | 'QUEUED' | 'RUNNING' | 'PAUSED' | 'COMPLETED'
type JobStatusFilter = 'ALL' | JobBucket | 'MISSING'

const BUCKET_LABELS: Record<JobBucket, string> = {
  UNASSIGNED: 'Unassigned',
  QUEUED: 'Queued',
  RUNNING: 'Running',
  PAUSED: 'Paused',
  COMPLETED: 'Completed',
}

const BUCKET_COLORS: Record<JobBucket, string> = {
  UNASSIGNED: 'default',
  QUEUED: 'blue',
  RUNNING: 'green',
  PAUSED: 'orange',
  COMPLETED: 'green',
}

const WC_TAG_COLORS: Record<PackingWorkCentreSession['status'], string> = {
  RUNNING: 'green',
  IDLE: 'default',
  ISSUE: 'orange',
  STOPPED: 'default',
}

interface JobRow {
  job: PackingJob
  bucket: JobBucket
}

// A Work Centre Session "belongs" to whichever Job has a claim on its
// slot — the Job with the RUNNING allocation there, the one that's
// ON_HOLD (paused without releasing the station), or, failing those, the
// earliest-queued not-yet-started one. That last case is what lets a
// queued Work Centre still show up (with its own "Start" button) under
// the Job that's waiting on it, rather than needing a separate
// unowned-sessions view — a Session only has no owner at all once it has
// no allocations whatsoever.
function sessionOwnerJobId(session: PackingWorkCentreSession): number | null {
  const current = session.allocations.find((a) => a.id === session.current_allocation_id)
  if (current) return current.job
  const held = session.allocations.find((a) => a.status === 'ON_HOLD')
  if (held) return held.job
  const queued = session.allocations
    .filter((a) => a.status === 'PLANNED')
    .sort((a, b) => a.sequence - b.sequence)[0]
  return queued ? queued.job : null
}

export default function TodaysWorkPage() {
  // Deep-link params (e.g. from a Packing Job's "View on Packing Floor"
  // link) — read once on mount to seed the initial date/shift/bay.
  const [searchParams] = useSearchParams()
  const [date, setDate] = useState<Dayjs>(() => {
    const d = searchParams.get('date')
    return d ? dayjs(d) : dayjs()
  })
  const [shifts, setShifts] = useState<Shift[]>([])
  const [shiftId, setShiftId] = useState<number | undefined>(() => {
    const s = searchParams.get('shift')
    return s ? Number(s) : undefined
  })
  const [shift, setShift] = useState<PackingShift | null>(null)
  const [config, setConfig] = useState<PackingExecutionConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [bayFilter, setBayFilter] = useState<number | 'ALL'>(() => {
    const b = searchParams.get('bay')
    return b ? Number(b) : 'ALL'
  })
  const [jobStatusFilter, setJobStatusFilter] = useState<JobStatusFilter>('ALL')

  const [detailSession, setDetailSession] = useState<PackingWorkCentreSession | null>(null)
  const [recordAllocation, setRecordAllocation] = useState<PackingWorkCentreAllocation | null>(null)
  const [summaryAllocation, setSummaryAllocation] = useState<PackingWorkCentreAllocation | null>(null)
  const [assignSessionId, setAssignSessionId] = useState<number | null>(null)
  const [issueSessionId, setIssueSessionId] = useState<number | null>(null)
  const [stopSession, setStopSession] = useState<PackingWorkCentreSession | null>(null)
  const [completeSession, setCompleteSession] = useState<PackingWorkCentreSession | null>(null)

  const [focusedJobId, setFocusedJobId] = useState<number | null>(null)
  const [focusedJob, setFocusedJob] = useState<PackingJob | null>(null)
  const [unassignedJobs, setUnassignedJobs] = useState<PackingJob[]>([])
  const [activeJobs, setActiveJobs] = useState<PackingJob[]>([])
  const [assigningJob, setAssigningJob] = useState<PackingJob | null>(null)

  const loadFocusedJob = useCallback(() => {
    if (focusedJobId === null) {
      setFocusedJob(null)
      return
    }
    getPackingJob(focusedJobId).then(setFocusedJob)
  }, [focusedJobId])

  useEffect(() => {
    loadFocusedJob()
  }, [loadFocusedJob])

  useEffect(() => {
    listShifts({ isActive: true }).then((response) => {
      setShifts(response.results)
      if (response.results.length > 0) setShiftId((prev) => prev ?? response.results[0].id)
    })
    getExecutionConfig().then(setConfig)
  }, [])

  const load = useCallback(() => {
    if (!shiftId) return
    setLoading(true)
    getTodaysShift(date.format('YYYY-MM-DD'), shiftId)
      .then((response) => {
        setShift(response.shift)
        setUnassignedJobs(response.unassigned_jobs)
        setActiveJobs(response.active_jobs)
      })
      .finally(() => setLoading(false))
  }, [date, shiftId])

  useEffect(() => {
    load()
  }, [load])

  // Keep any open drawer/modal's session data fresh after an action.
  useEffect(() => {
    if (!shift) return
    if (detailSession) {
      const fresh = shift.work_centre_sessions.find((s) => s.id === detailSession.id)
      if (fresh) setDetailSession(fresh)
    }
    if (stopSession) {
      const fresh = shift.work_centre_sessions.find((s) => s.id === stopSession.id)
      if (fresh) setStopSession(fresh)
    }
    if (completeSession) {
      const fresh = shift.work_centre_sessions.find((s) => s.id === completeSession.id)
      if (fresh) setCompleteSession(fresh)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shift])

  const sessions = useMemo(() => shift?.work_centre_sessions ?? [], [shift])
  const bays = useMemo(() => {
    const map = new Map<number, string>()
    sessions.forEach((s) => map.set(s.bay, s.bay_name))
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
  }, [sessions])

  const missingMinutes = config?.missing_record_warning_minutes ?? 15
  const isMissing = (s: PackingWorkCentreSession) => {
    const current = s.allocations.find((a) => a.id === s.current_allocation_id)
    return !!(
      s.status === 'RUNNING' &&
      current?.started_at &&
      dayjs().diff(dayjs(current.started_at), 'minute') > missingMinutes
    )
  }

  // Every Work Centre Session's Job, regardless of the Bay filter — a
  // focused Job should always show all of its own stations, even ones in
  // a Bay you've filtered out of the overview table.
  const sessionsByJob = useMemo(() => {
    const map = new Map<number, PackingWorkCentreSession[]>()
    sessions.forEach((session) => {
      const ownerId = sessionOwnerJobId(session)
      if (ownerId === null) return
      map.set(ownerId, [...(map.get(ownerId) ?? []), session])
    })
    return map
  }, [sessions])

  // Job-first, one row per Job: every active Job that's actually started
  // (RUNNING/PAUSED) shows its live Work Centres; one with an allocation
  // that hasn't started yet (still READY/AWAITING_MATERIAL) is "queued";
  // one with no allocation at all is "unassigned"; one that's finished
  // stays visible as "completed" rather than disappearing off the board.
  // This single table replaces three separate lists so you can see every
  // parallel Job at once instead of scrolling past a full card per Job.
  const allJobRows: JobRow[] = useMemo(() => {
    const runningOrPaused = activeJobs.filter(
      (j) => j.status === 'IN_PROGRESS' || j.status === 'ON_HOLD',
    )
    const completed = activeJobs.filter((j) => j.status === 'COMPLETED')
    const queued = activeJobs.filter(
      (j) => j.status !== 'IN_PROGRESS' && j.status !== 'ON_HOLD' && j.status !== 'COMPLETED',
    )
    return [
      ...unassignedJobs.map((job) => ({ job, bucket: 'UNASSIGNED' as const })),
      ...queued.map((job) => ({ job, bucket: 'QUEUED' as const })),
      ...runningOrPaused.map((job) => ({
        job,
        bucket: (job.status === 'ON_HOLD' ? 'PAUSED' : 'RUNNING') as JobBucket,
      })),
      ...completed.map((job) => ({ job, bucket: 'COMPLETED' as const })),
    ]
  }, [unassignedJobs, activeJobs])

  const isJobMissing = (job: PackingJob) => (sessionsByJob.get(job.id) ?? []).some(isMissing)

  const filteredJobRows = allJobRows.filter(({ job, bucket }) => {
    if (bayFilter !== 'ALL' && job.bay !== bayFilter) return false
    if (jobStatusFilter === 'ALL') return true
    if (jobStatusFilter === 'MISSING') return isJobMissing(job)
    return bucket === jobStatusFilter
  })

  const counts = {
    active: sessions.filter((s) => s.status !== 'STOPPED').length,
    working: sessions.filter((s) => s.status === 'RUNNING').length,
    idle: sessions.filter((s) => s.status === 'IDLE').length,
    issue: sessions.filter((s) => s.status === 'ISSUE').length,
  }

  const handleStopShift = async () => {
    if (!shift) return
    try {
      await stopPackingShift(shift.id)
      message.success('Shift stopped.')
      load()
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : 'Could not stop the shift.')
    }
  }

  const handleResume = async (session: PackingWorkCentreSession) => {
    try {
      await resumeWorkCentreSession(session.id)
      load()
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : 'Could not resume this Work Centre.')
    }
  }

  const handleStartAllocation = async (allocationId: number) => {
    try {
      await startAllocation(allocationId)
      load()
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : 'Could not start this SKU.')
    }
  }

  return (
    <Card
      loading={loading && !shift}
      title={
        <Flex justify="space-between" align="center" wrap="wrap" gap={12}>
          <Title level={4} style={{ margin: 0 }}>
            Packing Floor
          </Title>
          <Space>
            <DatePicker value={date} onChange={(d) => d && setDate(d)} format="DD MMM YYYY" />
            <Select
              aria-label="Shift"
              style={{ width: 140 }}
              value={shiftId}
              onChange={setShiftId}
              options={shifts.map((s) => ({ value: s.id, label: s.name }))}
            />
          </Space>
        </Flex>
      }
    >
      <Card
        size="small"
        style={{ marginBottom: 16 }}
        title={`All Packing Jobs (${filteredJobRows.length})`}
        extra={
          shift && shift.status !== 'NOT_STARTED' ? (
            <Space size="large" wrap>
              <Text>
                Active: <Text strong>{counts.active}</Text>
              </Text>
              <Text>
                Working: <Text strong>{counts.working}</Text>
              </Text>
              <Text>
                Idle: <Text strong>{counts.idle}</Text>
              </Text>
              <Text>
                Issue: <Text strong>{counts.issue}</Text>
              </Text>
              <Button danger size="small" onClick={() => void handleStopShift()}>
                Stop Shift
              </Button>
            </Space>
          ) : undefined
        }
      >
        <Flex justify="flex-end" align="center" wrap="wrap" gap={12} style={{ marginBottom: 12 }}>
          <Space wrap>
            <Select
              aria-label="Jump to Job"
              placeholder="Jump to a Job..."
              showSearch
              allowClear
              style={{ width: 220 }}
              value={focusedJobId ?? undefined}
              onChange={(v) => setFocusedJobId(v ?? null)}
              onClear={() => setFocusedJobId(null)}
              filterOption={(input, option) =>
                ((option?.label as string) ?? '').toLowerCase().includes(input.toLowerCase())
              }
              options={allJobRows.map(({ job }) => ({ value: job.id, label: job.job_number }))}
            />
            <Select
              aria-label="Bay"
              style={{ width: 140 }}
              value={bayFilter}
              onChange={setBayFilter}
              options={[{ value: 'ALL', label: 'All Bays' }, ...bays.map((b) => ({ value: b.id, label: b.name }))]}
            />
            <Segmented
              value={jobStatusFilter}
              onChange={(v) => setJobStatusFilter(v as JobStatusFilter)}
              options={[
                { label: 'All', value: 'ALL' },
                { label: 'Unassigned', value: 'UNASSIGNED' },
                { label: 'Queued', value: 'QUEUED' },
                { label: 'Running', value: 'RUNNING' },
                { label: 'Paused', value: 'PAUSED' },
                { label: 'Completed', value: 'COMPLETED' },
                { label: 'Missing Records', value: 'MISSING' },
              ]}
            />
          </Space>
        </Flex>

        <Table<JobRow>
          rowKey={(r) => r.job.id}
          size="small"
          pagination={false}
          dataSource={filteredJobRows}
          locale={{ emptyText: 'No Jobs match this filter.' }}
          expandable={{
            expandedRowKeys: focusedJobId !== null ? [focusedJobId] : [],
            onExpand: (expanded, record) => setFocusedJobId(expanded ? record.job.id : null),
            expandRowByClick: true,
            expandedRowRender: (record) => {
              if (!focusedJob || focusedJob.id !== record.job.id) return null
              return (
                <>
                  <PackingJobGroup
                    job={focusedJob}
                    sessions={sessionsByJob.get(focusedJob.id) ?? []}
                    missingRecordMinutes={missingMinutes}
                    onChanged={() => {
                      loadFocusedJob()
                      load()
                    }}
                    onOpenDetail={(session) => setDetailSession(session)}
                    onRecordHour={(session) => {
                      const current = session.allocations.find(
                        (a) => a.id === session.current_allocation_id,
                      )
                      if (current) setRecordAllocation(current)
                    }}
                    onRecordSummary={(session) => {
                      const current = session.allocations.find(
                        (a) => a.id === session.current_allocation_id,
                      )
                      if (current) setSummaryAllocation(current)
                    }}
                    onAssignWork={(session) => setAssignSessionId(session.id)}
                    onStartAllocation={(allocationId) => void handleStartAllocation(allocationId)}
                    onReportIssue={(session) => setIssueSessionId(session.id)}
                    onStopWorkCentre={(session) => setStopSession(session)}
                    onResume={(session) => void handleResume(session)}
                    onAddWorkCentre={setAssigningJob}
                    compact
                    middleSlot={
                      <div style={{ marginBottom: 16 }}>
                        <Text
                          strong
                          style={{
                            display: 'block',
                            marginBottom: 8,
                            textTransform: 'uppercase',
                            fontSize: 12,
                          }}
                        >
                          Material
                        </Text>
                        <JobMaterialSection
                          job={focusedJob}
                          onChanged={() => {
                            loadFocusedJob()
                            load()
                          }}
                        />
                      </div>
                    }
                  />
                  <Card>
                    <JobDetailTabs job={focusedJob} variant="floor" />
                  </Card>
                </>
              )
            },
          }}
          columns={[
            {
              title: 'Job',
              key: 'job',
              render: (_, { job }) => (
                <Text strong>{job.job_number}</Text>
              ),
            },
            {
              title: 'Product',
              key: 'product',
              render: (_, { job }) => (
                <>
                  <div>{job.item_name}</div>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {job.order_no} • {job.customer_sku_code || '—'}
                  </Text>
                </>
              ),
            },
            { title: 'Bay', key: 'bay', render: (_, { job }) => job.bay_name, width: 90 },
            {
              title: 'Status',
              key: 'status',
              width: 110,
              render: (_, { bucket }) => <Tag color={BUCKET_COLORS[bucket]}>{BUCKET_LABELS[bucket]}</Tag>,
            },
            {
              title: 'Work Centres',
              key: 'work_centres',
              render: (_, { job }) => {
                const jobSessions = sessionsByJob.get(job.id) ?? []
                if (jobSessions.length === 0) return <Text type="secondary">—</Text>
                return (
                  <Space size={4} wrap>
                    {jobSessions.map((s) => (
                      <Tag key={s.id} color={WC_TAG_COLORS[s.status]}>
                        {s.work_centre_code}
                      </Tag>
                    ))}
                  </Space>
                )
              },
            },
            {
              title: 'Progress',
              key: 'progress',
              width: 140,
              render: (_, { job }) => (
                <Progress
                  percent={Math.round(((job.target_qty - job.balance_qty) / (job.target_qty || 1)) * 100)}
                  size="small"
                />
              ),
            },
            {
              title: '',
              key: 'missing',
              width: 32,
              render: (_, { job }) =>
                isJobMissing(job) ? (
                  <Tooltip title="At least one Work Centre is overdue for a record.">
                    <WarningOutlined style={{ color: '#faad14' }} />
                  </Tooltip>
                ) : null,
            },
          ]}
        />
      </Card>

      <AddWorkCentreModal
        open={assigningJob !== null}
        job={assigningJob}
        sessions={sessions}
        date={date.format('YYYY-MM-DD')}
        shiftId={shiftId ?? 0}
        onClose={() => setAssigningJob(null)}
        onAssigned={() => {
          setAssigningJob(null)
          loadFocusedJob()
          load()
        }}
      />
      <AssignWorkModal
        open={assignSessionId !== null}
        sessionId={assignSessionId}
        onClose={() => setAssignSessionId(null)}
        onAssigned={() => {
          setAssignSessionId(null)
          load()
        }}
      />
      <ReportIssueModal
        open={issueSessionId !== null}
        sessionId={issueSessionId}
        onClose={() => setIssueSessionId(null)}
        onReported={() => {
          setIssueSessionId(null)
          load()
        }}
      />
      <StopWorkCentreModal
        open={stopSession !== null}
        session={stopSession}
        onClose={() => setStopSession(null)}
        onStopped={() => {
          setStopSession(null)
          setDetailSession(null)
          load()
        }}
      />
      <CompleteAllocationModal
        open={completeSession !== null}
        session={completeSession}
        onClose={() => setCompleteSession(null)}
        onChanged={() => {
          load()
        }}
        onAssignWork={() => {
          const sid = completeSession?.id ?? null
          setCompleteSession(null)
          setAssignSessionId(sid)
        }}
      />
      <RecordIntervalModal
        open={recordAllocation !== null}
        allocation={recordAllocation}
        onClose={() => setRecordAllocation(null)}
        onSaved={() => {
          load()
        }}
      />
      <RecordSummaryModal
        open={summaryAllocation !== null}
        allocation={summaryAllocation}
        onClose={() => setSummaryAllocation(null)}
        onSaved={() => {
          load()
        }}
      />

      <WorkCentreDetailDrawer
        open={detailSession !== null}
        session={detailSession}
        onClose={() => setDetailSession(null)}
        onRecordHour={() => {
          const current = detailSession?.allocations.find((a) => a.id === detailSession.current_allocation_id)
          if (current) setRecordAllocation(current)
        }}
        onRecordSummary={() => {
          const current = detailSession?.allocations.find((a) => a.id === detailSession.current_allocation_id)
          if (current) setSummaryAllocation(current)
        }}
        onCompleteOrChangeSku={() => {
          if (detailSession) setCompleteSession(detailSession)
        }}
        onReportIssue={() => detailSession && setIssueSessionId(detailSession.id)}
        onStopWorkCentre={() => detailSession && setStopSession(detailSession)}
        onStartAllocation={(allocationId) => void handleStartAllocation(allocationId)}
        onFocusJob={setFocusedJobId}
      />
    </Card>
  )
}
