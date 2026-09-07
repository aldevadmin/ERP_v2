import { Fragment, useCallback, useEffect, useState } from 'react'
import { Button, Card, Flex, Select, Tag, Typography, message } from 'antd'
import { LeftOutlined, RightOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { useNavigate } from 'react-router'
import { ApiError } from '../../shared/api/http'
import { listBays } from '../work-centres/api'
import type { Bay } from '../work-centres/types'
import { listPackingPlanLines, listShifts, releasePackingPlanLine } from './api'
import type { PackingPlanLine, Shift } from './types'

const { Title, Text } = Typography

function startOfWeek(d: Dayjs): Dayjs {
  const day = d.day()
  const diff = day === 0 ? -6 : 1 - day // Monday as first day
  return d.add(diff, 'day').startOf('day')
}

export default function WeeklyPackingPlannerPage() {
  const navigate = useNavigate()
  const [weekStart, setWeekStart] = useState(() => startOfWeek(dayjs()))
  const [shifts, setShifts] = useState<Shift[]>([])
  const [bays, setBays] = useState<Bay[]>([])
  const [shiftId, setShiftId] = useState<number | undefined>(undefined)
  const [lines, setLines] = useState<PackingPlanLine[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listShifts({ isActive: true }).then((response) => {
      setShifts(response.results)
      if (response.results.length > 0) setShiftId((prev) => prev ?? response.results[0].id)
    })
    listBays({ isActive: true }).then((response) => setBays(response.results))
  }, [])

  const days = Array.from({ length: 7 }, (_, i) => weekStart.add(i, 'day'))

  const load = useCallback(() => {
    if (!shiftId) return
    setLoading(true)
    listPackingPlanLines({
      weekStart: weekStart.format('YYYY-MM-DD'),
      weekEnd: weekStart.add(6, 'day').format('YYYY-MM-DD'),
      shiftId,
    })
      .then((response) => setLines(response.results))
      .finally(() => setLoading(false))
  }, [weekStart, shiftId])

  useEffect(() => {
    load()
  }, [load])

  const handleRelease = async (line: PackingPlanLine) => {
    try {
      const job = await releasePackingPlanLine(line.id)
      message.success(`Released as ${job.job_number}.`)
      navigate(`/packing/jobs/${job.id}`)
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : 'Could not release this plan.')
    }
  }

  return (
    <Card
      title={
        <Title level={4} style={{ margin: 0 }}>
          Weekly Packing Planner
        </Title>
      }
    >
      <Flex justify="space-between" align="center" wrap="wrap" gap={12} style={{ marginBottom: 16 }}>
        <Select
          aria-label="Shift"
          style={{ width: 160 }}
          value={shiftId}
          onChange={setShiftId}
          options={shifts.map((s) => ({ value: s.id, label: s.name }))}
        />
        <Flex gap={8} align="center">
          <Button icon={<LeftOutlined />} onClick={() => setWeekStart((w) => w.subtract(7, 'day'))} />
          <Button onClick={() => setWeekStart(startOfWeek(dayjs()))}>Today</Button>
          <Button icon={<RightOutlined />} onClick={() => setWeekStart((w) => w.add(7, 'day'))} />
          <Text strong>
            {weekStart.format('DD MMM')} – {weekStart.add(6, 'day').format('DD MMM')}
          </Text>
        </Flex>
      </Flex>

      <div style={{ overflowX: 'auto' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `140px repeat(7, minmax(150px, 1fr))`,
            border: '1px solid #f0f0f0',
            borderRadius: 8,
            minWidth: 900,
          }}
        >
          <div style={{ padding: 8, fontWeight: 500, borderBottom: '1px solid #f0f0f0' }} />
          {days.map((d) => (
            <div
              key={d.format('YYYY-MM-DD')}
              style={{
                padding: 8,
                fontWeight: 500,
                textAlign: 'center',
                borderBottom: '1px solid #f0f0f0',
                borderLeft: '1px solid #f0f0f0',
              }}
            >
              {d.format('ddd DD').toUpperCase()}
            </div>
          ))}

          {bays.map((bay) => (
            <Fragment key={bay.id}>
              <div
                style={{
                  padding: 8,
                  fontWeight: 500,
                  borderBottom: '1px solid #f0f0f0',
                  background: '#fafafa',
                }}
              >
                {bay.name}
              </div>
              {days.map((d) => {
                const cellLines = lines.filter(
                  (l) => l.bay === bay.id && l.date === d.format('YYYY-MM-DD'),
                )
                return (
                  <div
                    key={`${bay.id}-${d.format('YYYY-MM-DD')}`}
                    style={{
                      padding: 6,
                      borderBottom: '1px solid #f0f0f0',
                      borderLeft: '1px solid #f0f0f0',
                      minHeight: 64,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}
                  >
                    {cellLines.map((line) => (
                      <div
                        key={line.id}
                        style={{
                          background: line.has_job ? '#f6ffed' : '#e6f4ff',
                          border: '1px solid #f0f0f0',
                          borderRadius: 6,
                          padding: '4px 6px',
                          fontSize: 12,
                          cursor: line.status === 'PLANNED' && !line.has_job ? 'pointer' : 'default',
                        }}
                        onClick={() => {
                          if (line.status === 'PLANNED' && !line.has_job) void handleRelease(line)
                        }}
                        title={
                          line.status === 'PLANNED' && !line.has_job
                            ? 'Click to release as a Packing Job'
                            : undefined
                        }
                      >
                        <div>{line.order_no}</div>
                        <div style={{ color: '#8c8c8c' }}>{line.item_name}</div>
                        <div>{line.planned_qty.toLocaleString()} pcs</div>
                        {line.has_job && (
                          <Tag color="green" style={{ marginTop: 2 }}>
                            Released
                          </Tag>
                        )}
                      </div>
                    ))}
                  </div>
                )
              })}
            </Fragment>
          ))}
        </div>
      </div>
      {!loading && bays.length === 0 && (
        <Text type="secondary" style={{ display: 'block', marginTop: 16 }}>
          No Bays configured yet — add one in Settings → Bays.
        </Text>
      )}
    </Card>
  )
}
