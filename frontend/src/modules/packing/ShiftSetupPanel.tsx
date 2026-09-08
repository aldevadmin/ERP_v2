import { useEffect, useState } from 'react'
import { Alert, Button, Checkbox, Flex, Select, Space, Typography, message } from 'antd'
import { ApiError } from '../../shared/api/http'
import { listEmployees } from '../accounts/api'
import type { Employee } from '../accounts/types'
import { listBays, listWorkCentres } from '../work-centres/api'
import type { Bay, WorkCentre } from '../work-centres/types'
import { startPackingShift } from './api'
import type { PackingShift } from './types'

const { Title, Text } = Typography

export default function ShiftSetupPanel({
  date,
  shiftId,
  onStarted,
}: {
  date: string
  shiftId: number
  onStarted: (shift: PackingShift) => void
}) {
  const [bays, setBays] = useState<Bay[]>([])
  const [workCentres, setWorkCentres] = useState<WorkCentre[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [selected, setSelected] = useState<Record<number, boolean>>({})
  const [operators, setOperators] = useState<Record<number, [number | null, number | null]>>({})
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listBays({ isActive: true }).then((response) => setBays(response.results))
    listWorkCentres({ isActive: true }).then((response) => setWorkCentres(response.results))
    listEmployees({ isActive: true }).then((response) => setEmployees(response.results))
  }, [])

  const byBay = bays.map((bay) => ({
    bay,
    workCentres: workCentres.filter((wc) => wc.bay === bay.id),
  }))

  const toggle = (wcId: number, checked: boolean) => {
    setSelected((prev) => ({ ...prev, [wcId]: checked }))
  }

  const setOperator = (wcId: number, index: 0 | 1, employeeId: number | null) => {
    setOperators((prev) => {
      const pair: [number | null, number | null] = prev[wcId] ?? [null, null]
      const next: [number | null, number | null] = [...pair]
      next[index] = employeeId
      return { ...prev, [wcId]: next }
    })
  }

  const selectedWorkCentreIds = Object.entries(selected)
    .filter(([, checked]) => checked)
    .map(([id]) => Number(id))
  const selectedOperatorCount = selectedWorkCentreIds.reduce(
    (sum, id) => sum + (operators[id] ?? []).filter(Boolean).length,
    0,
  )

  const handleStart = async () => {
    setError(null)
    if (selectedWorkCentreIds.length === 0) {
      setError('Select at least one Work Centre.')
      return
    }
    setStarting(true)
    try {
      const shift = await startPackingShift(
        date,
        shiftId,
        selectedWorkCentreIds.map((id) => ({
          work_centre: id,
          operator_ids: (operators[id] ?? []).filter((v): v is number => v !== null),
        })),
      )
      message.success('Shift started.')
      onStarted(shift)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start the shift.')
    } finally {
      setStarting(false)
    }
  }

  return (
    <div>
      {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}
      <Flex vertical gap={20}>
        {byBay.map(({ bay, workCentres: bayWorkCentres }) => (
          <div key={bay.id}>
            <Title level={5} style={{ marginBottom: 8 }}>
              {bay.name.toUpperCase()}
            </Title>
            <Flex vertical gap={8}>
              {bayWorkCentres.map((wc) => (
                <Flex key={wc.id} align="center" gap={12} wrap="wrap">
                  <Checkbox
                    checked={!!selected[wc.id]}
                    onChange={(e) => toggle(wc.id, e.target.checked)}
                    style={{ width: 90 }}
                  >
                    {wc.code}
                  </Checkbox>
                  <Select
                    placeholder="Operator 1"
                    style={{ width: 160 }}
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    disabled={!selected[wc.id]}
                    value={operators[wc.id]?.[0] ?? undefined}
                    onChange={(v) => setOperator(wc.id, 0, v ?? null)}
                    options={employees.map((e) => ({ value: e.id, label: e.full_name }))}
                  />
                  <Select
                    placeholder="Operator 2"
                    style={{ width: 160 }}
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    disabled={!selected[wc.id]}
                    value={operators[wc.id]?.[1] ?? undefined}
                    onChange={(v) => setOperator(wc.id, 1, v ?? null)}
                    options={employees.map((e) => ({ value: e.id, label: e.full_name }))}
                  />
                </Flex>
              ))}
              {bayWorkCentres.length === 0 && <Text type="secondary">No Work Centres in this Bay.</Text>}
            </Flex>
          </div>
        ))}
      </Flex>

      <Flex justify="space-between" align="center" style={{ marginTop: 24 }}>
        <Space size="large">
          <Text>
            Work Centres Selected: <Text strong>{selectedWorkCentreIds.length}</Text>
          </Text>
          <Text>
            Operators Allocated: <Text strong>{selectedOperatorCount}</Text>
          </Text>
        </Space>
        <Button type="primary" loading={starting} onClick={() => void handleStart()}>
          Start Shift
        </Button>
      </Flex>
    </div>
  )
}
