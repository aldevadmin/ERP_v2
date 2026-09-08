import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Card, DatePicker, Empty, Flex, Segmented, Select, Space, Typography, message } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { useSearchParams } from 'react-router'
import { ApiError } from '../../shared/api/http'
import AssignWorkModal from './AssignWorkModal'
import CompleteAllocationModal from './CompleteAllocationModal'
import RecordIntervalModal from './RecordIntervalModal'
import ReportIssueModal from './ReportIssueModal'
import ShiftSetupPanel from './ShiftSetupPanel'
import StopWorkCentreModal from './StopWorkCentreModal'
import {
  getExecutionConfig,
  getTodaysShift,
  listShifts,
  resumeWorkCentreSession,
  startAllocation,
  stopPackingShift,
} from './api'
import type { PackingExecutionConfig, PackingShift, PackingWorkCentreAllocation, PackingWorkCentreSession, Shift } from './types'
import WorkCentreDetailDrawer from './WorkCentreDetailDrawer'
import WorkCentreTile from './WorkCentreTile'

const { Title, Text } = Typography

type StatusFilter = 'ALL' | 'RUNNING' | 'IDLE' | 'ISSUE' | 'STOPPED' | 'MISSING'

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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')

  const [detailSession, setDetailSession] = useState<PackingWorkCentreSession | null>(null)
  const [recordAllocation, setRecordAllocation] = useState<PackingWorkCentreAllocation | null>(null)
  const [assignSessionId, setAssignSessionId] = useState<number | null>(null)
  const [issueSessionId, setIssueSessionId] = useState<number | null>(null)
  const [stopSession, setStopSession] = useState<PackingWorkCentreSession | null>(null)
  const [completeSession, setCompleteSession] = useState<PackingWorkCentreSession | null>(null)

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
      .then((response) => setShift(response.shift))
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

  const filteredSessions = sessions.filter((s) => {
    if (bayFilter !== 'ALL' && s.bay !== bayFilter) return false
    if (statusFilter === 'ALL') return true
    if (statusFilter === 'MISSING') return isMissing(s)
    return s.status === statusFilter
  })

  const grouped = useMemo(() => {
    const map = new Map<string, PackingWorkCentreSession[]>()
    filteredSessions.forEach((s) => {
      map.set(s.bay_name, [...(map.get(s.bay_name) ?? []), s])
    })
    return Array.from(map.entries())
  }, [filteredSessions])

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
      {!shift || shift.status === 'NOT_STARTED' ? (
        shiftId ? (
          <ShiftSetupPanel
            date={date.format('YYYY-MM-DD')}
            shiftId={shiftId}
            onStarted={() => load()}
          />
        ) : (
          <Empty description="No shifts configured yet." />
        )
      ) : (
        <div>
          <Flex justify="space-between" align="center" wrap="wrap" gap={12} style={{ marginBottom: 16 }}>
            <Space wrap>
              <Select
                aria-label="Bay"
                style={{ width: 160 }}
                value={bayFilter}
                onChange={setBayFilter}
                options={[{ value: 'ALL', label: 'All Bays' }, ...bays.map((b) => ({ value: b.id, label: b.name }))]}
              />
              <Segmented
                value={statusFilter}
                onChange={(v) => setStatusFilter(v as StatusFilter)}
                options={[
                  { label: 'All', value: 'ALL' },
                  { label: 'Running', value: 'RUNNING' },
                  { label: 'Idle', value: 'IDLE' },
                  { label: 'Issue', value: 'ISSUE' },
                  { label: 'Stopped', value: 'STOPPED' },
                  { label: 'Missing Records', value: 'MISSING' },
                ]}
              />
            </Space>
            <Space size="large">
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
              <Button danger onClick={() => void handleStopShift()}>
                Stop Shift
              </Button>
            </Space>
          </Flex>

          {grouped.length === 0 && <Empty description="No Work Centres match this filter." />}

          <Flex vertical gap={20}>
            {grouped.map(([bayName, baySessions]) => (
              <div key={bayName}>
                <Text strong style={{ display: 'block', marginBottom: 8, textTransform: 'uppercase' }}>
                  {bayName}
                </Text>
                <Flex gap={12} wrap="wrap">
                  {baySessions.map((session) => (
                    <WorkCentreTile
                      key={session.id}
                      session={session}
                      missingRecordMinutes={missingMinutes}
                      onOpenDetail={() => setDetailSession(session)}
                      onRecordHour={() => {
                        const current = session.allocations.find((a) => a.id === session.current_allocation_id)
                        if (current) setRecordAllocation(current)
                      }}
                      onAssignWork={() => setAssignSessionId(session.id)}
                      onStartAllocation={(allocationId) => void handleStartAllocation(allocationId)}
                      onReportIssue={() => setIssueSessionId(session.id)}
                      onStopWorkCentre={() => setStopSession(session)}
                      onResume={() => void handleResume(session)}
                    />
                  ))}
                </Flex>
              </div>
            ))}
          </Flex>
        </div>
      )}

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

      <WorkCentreDetailDrawer
        open={detailSession !== null}
        session={detailSession}
        onClose={() => setDetailSession(null)}
        onRecordHour={() => {
          const current = detailSession?.allocations.find((a) => a.id === detailSession.current_allocation_id)
          if (current) setRecordAllocation(current)
        }}
        onCompleteOrChangeSku={() => {
          if (detailSession) setCompleteSession(detailSession)
        }}
        onReportIssue={() => detailSession && setIssueSessionId(detailSession.id)}
        onStopWorkCentre={() => detailSession && setStopSession(detailSession)}
        onStartAllocation={(allocationId) => void handleStartAllocation(allocationId)}
      />
    </Card>
  )
}
