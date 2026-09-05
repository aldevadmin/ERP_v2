import { useCallback, useEffect, useState } from 'react'
import { Button, Card, DatePicker, Empty, Flex, Progress, Select, Tag, Typography } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { useNavigate } from 'react-router'
import { listShifts, listTodaysWork } from './api'
import type { Shift, TodaysWorkRow } from './types'

const { Title, Text } = Typography

export default function TodaysWorkPage() {
  const navigate = useNavigate()
  const [date, setDate] = useState<Dayjs>(dayjs())
  const [shifts, setShifts] = useState<Shift[]>([])
  const [shiftId, setShiftId] = useState<number | undefined>(undefined)
  const [rows, setRows] = useState<TodaysWorkRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listShifts({ isActive: true }).then((response) => {
      setShifts(response.results)
      if (response.results.length > 0) setShiftId((prev) => prev ?? response.results[0].id)
    })
  }, [])

  const load = useCallback(() => {
    setLoading(true)
    listTodaysWork(date.format('YYYY-MM-DD'), shiftId)
      .then((response) => setRows(response.results))
      .finally(() => setLoading(false))
  }, [date, shiftId])

  useEffect(() => {
    load()
  }, [load])

  const grouped = rows.reduce<Record<string, TodaysWorkRow[]>>((acc, row) => {
    const key = row.bay_name
    acc[key] = acc[key] ? [...acc[key], row] : [row]
    return acc
  }, {})

  // Roll up per job within a bay, so each card is one job (matching the
  // spec's wireframe), not one row per work-centre allocation.
  const jobsByBay = Object.entries(grouped).map(([bayName, bayRows]) => {
    const byJob = new Map<number, TodaysWorkRow[]>()
    for (const row of bayRows) {
      byJob.set(row.job_id, [...(byJob.get(row.job_id) ?? []), row])
    }
    return { bayName, jobs: Array.from(byJob.values()) }
  })

  return (
    <Card
      title={
        <Title level={4} style={{ margin: 0 }}>
          Today&apos;s Packing
        </Title>
      }
    >
      <Flex gap={12} wrap="wrap" style={{ marginBottom: 16 }}>
        <DatePicker value={date} onChange={(d) => d && setDate(d)} format="DD MMM YYYY" />
        <Select
          aria-label="Shift"
          style={{ width: 160 }}
          value={shiftId}
          onChange={setShiftId}
          options={shifts.map((s) => ({ value: s.id, label: s.name }))}
        />
      </Flex>

      {!loading && jobsByBay.length === 0 && (
        <Empty description="Nothing allocated for this date/shift yet." />
      )}

      <Flex vertical gap={16}>
        {jobsByBay.map(({ bayName, jobs }) => (
          <div key={bayName}>
            <Text strong style={{ display: 'block', marginBottom: 8, textTransform: 'uppercase' }}>
              {bayName}
            </Text>
            <Flex gap={12} wrap="wrap">
              {jobs.map((jobRows) => {
                const first = jobRows[0]
                const target = jobRows.reduce((sum, r) => sum + r.assigned_qty, 0)
                const packed = jobRows.reduce((sum, r) => sum + r.packed_qty, 0)
                const active = jobRows.filter((r) => r.status === 'RUNNING').length
                return (
                  <Card key={first.job_id} size="small" style={{ width: 260 }}>
                    <Text strong>{first.job_number}</Text>
                    <div>
                      <Text type="secondary">
                        {first.order_no} • {first.item_name}
                      </Text>
                    </div>
                    <Flex justify="space-between" style={{ margin: '8px 0' }}>
                      <Text>Target {target.toLocaleString()}</Text>
                      <Text>Packed {packed.toLocaleString()}</Text>
                    </Flex>
                    <Progress percent={Math.round((packed / (target || 1)) * 100)} size="small" />
                    <Flex justify="space-between" align="center" style={{ marginTop: 8 }}>
                      <Tag>
                        {active} Active / {jobRows.length} Allocated
                      </Tag>
                      <Button size="small" onClick={() => navigate(`/packing/jobs/${first.job_id}`)}>
                        Open Job
                      </Button>
                    </Flex>
                  </Card>
                )
              })}
            </Flex>
          </div>
        ))}
      </Flex>
    </Card>
  )
}
