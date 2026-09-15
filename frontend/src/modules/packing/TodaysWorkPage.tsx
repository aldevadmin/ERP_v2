import { useEffect, useState } from 'react'
import { Button, Flex, Select, Table, Tag, Typography, message } from 'antd'
import dayjs from 'dayjs'
import { ApiError } from '../../shared/api/http'
import SectionCard from '../../shared/components/SectionCard'
import AddBoxingRecordModal from './AddBoxingRecordModal'
import AddWorkCentreRecordModal from './AddWorkCentreRecordModal'
import CloseTodayModal from './CloseTodayModal'
import {
  getDayReconciliation,
  listBoxingRecords,
  listPackingAllotments,
  listWorkCentreRecords,
  listWorkCentresLite,
  setWorkCentreStatus,
} from './api'
import type {
  BoxingRecordRow,
  DayReconciliation,
  PackingAllotmentRow,
  WorkCentreOperationalStatus,
  WorkCentreRecordRow,
  WorkCentreRow,
} from './types'

const { Text } = Typography

const TODAY = dayjs().format('YYYY-MM-DD')

const STATUS_OPTIONS: { value: WorkCentreOperationalStatus; label: string }[] = [
  { value: 'RUNNING', label: 'Running' },
  { value: 'DOWN', label: 'Down' },
]

const STATUS_COLORS: Record<WorkCentreOperationalStatus, string> = {
  RUNNING: 'green',
  DOWN: 'red',
}

/** Read-only ticket/plan for the day, plus the Work Centre section where
 * actual output gets recorded against those Jobs — see
 * `AddWorkCentreRecordModal` for why there's no persistent "this WC is
 * working Job X" state.
 */
export default function TodaysWorkPage() {
  const [rows, setRows] = useState<PackingAllotmentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [workCentres, setWorkCentres] = useState<WorkCentreRow[]>([])
  const [records, setRecords] = useState<WorkCentreRecordRow[]>([])
  const [recordsLoading, setRecordsLoading] = useState(true)
  const [recordingFor, setRecordingFor] = useState<WorkCentreRow | null>(null)
  const [boxingFor, setBoxingFor] = useState<WorkCentreRow | null>(null)
  const [boxingRecords, setBoxingRecords] = useState<BoxingRecordRow[]>([])
  const [boxingRecordsLoading, setBoxingRecordsLoading] = useState(true)
  const [reconciliation, setReconciliation] = useState<DayReconciliation | null>(null)
  const [closeModalOpen, setCloseModalOpen] = useState(false)

  useEffect(() => {
    setLoading(true)
    listPackingAllotments({ status: 'RELEASED', date: TODAY })
      .then(setRows)
      .catch((err) => message.error(err instanceof ApiError ? err.message : "Could not load today's work."))
      .finally(() => setLoading(false))
  }, [])

  const loadReconciliation = () => {
    getDayReconciliation()
      .then(setReconciliation)
      .catch((err) => message.error(err instanceof ApiError ? err.message : "Could not load today's status."))
  }

  useEffect(loadReconciliation, [])

  const alreadyClosed = reconciliation?.already_closed ?? false

  const loadWorkCentres = () => {
    listWorkCentresLite()
      .then(setWorkCentres)
      .catch((err) => message.error(err instanceof ApiError ? err.message : 'Could not load Work Centres.'))
  }

  useEffect(loadWorkCentres, [])

  const handleStatusChange = async (wc: WorkCentreRow, status: WorkCentreOperationalStatus) => {
    try {
      const updated = await setWorkCentreStatus(wc.id, status)
      setWorkCentres((prev) => prev.map((w) => (w.id === wc.id ? updated : w)))
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : 'Could not update this Work Centre.')
    }
  }

  const loadRecords = () => {
    setRecordsLoading(true)
    listWorkCentreRecords()
      .then(setRecords)
      .catch((err) => message.error(err instanceof ApiError ? err.message : 'Could not load records.'))
      .finally(() => setRecordsLoading(false))
  }

  useEffect(loadRecords, [])

  const loadBoxingRecords = () => {
    setBoxingRecordsLoading(true)
    listBoxingRecords()
      .then(setBoxingRecords)
      .catch((err) => message.error(err instanceof ApiError ? err.message : 'Could not load boxing records.'))
      .finally(() => setBoxingRecordsLoading(false))
  }

  useEffect(loadBoxingRecords, [])

  return (
    <Flex vertical gap={16}>
      <SectionCard
        title="Today's Work"
        extra={
          alreadyClosed ? (
            <Tag color="default">Closed</Tag>
          ) : reconciliation && reconciliation.date !== TODAY ? (
            <Button size="small" danger onClick={() => setCloseModalOpen(true)}>
              Close {dayjs(reconciliation.date).format('DD MMM YYYY')} (overdue)
            </Button>
          ) : (
            <Button size="small" onClick={() => setCloseModalOpen(true)}>
              Close Today's Work
            </Button>
          )
        }
      >
        <Table<PackingAllotmentRow>
          rowKey="id"
          loading={loading}
          dataSource={rows}
          pagination={false}
          locale={{ emptyText: 'Nothing released to the packing floor yet today.' }}
          columns={[
            { title: 'Job ID', dataIndex: 'job_id' },
            { title: 'Customer', dataIndex: 'customer_name' },
            { title: 'Order #', dataIndex: 'order_no' },
            { title: 'SKU', dataIndex: 'customer_sku_code' },
            {
              title: "Today's Allotment",
              dataIndex: 'allotted_cartons',
              align: 'right',
              render: (v: number) => v.toLocaleString(),
            },
            {
              title: 'Plate/Pouch',
              dataIndex: 'pieces_per_pouch',
              align: 'right',
              render: (v: number | null) => (v ?? '—').toLocaleString(),
            },
            {
              title: 'Pouches/Case',
              dataIndex: 'pouches_per_carton',
              align: 'right',
              render: (v: number | null) => (v ?? '—').toLocaleString(),
            },
            {
              title: 'Plates/Box',
              dataIndex: 'pieces_per_carton',
              align: 'right',
              render: (v: number | null) => (v ?? '—').toLocaleString(),
            },
            {
              title: 'Total Plates',
              dataIndex: 'total_pieces',
              align: 'right',
              render: (v: number | null) => (v ?? '—').toLocaleString(),
            },
          ]}
        />
      </SectionCard>

      <SectionCard title="Work Centres">
        <Table<WorkCentreRow>
          rowKey="id"
          dataSource={workCentres}
          pagination={false}
          locale={{ emptyText: 'No active Work Centres configured.' }}
          columns={[
            { title: 'Work Centre', dataIndex: 'code' },
            { title: 'Name', dataIndex: 'name' },
            {
              title: 'Status',
              dataIndex: 'status',
              render: (status: WorkCentreOperationalStatus, wc) => (
                <Select<WorkCentreOperationalStatus>
                  size="small"
                  value={status}
                  style={{ width: 120 }}
                  variant="borderless"
                  onChange={(value) => void handleStatusChange(wc, value)}
                  options={STATUS_OPTIONS.map((option) => ({
                    ...option,
                    label: <Tag color={STATUS_COLORS[option.value]}>{option.label}</Tag>,
                  }))}
                />
              ),
            },
            {
              title: '',
              key: 'actions',
              render: (_, wc) => (
                <Flex gap={8}>
                  <Button
                    size="small"
                    disabled={wc.status === 'DOWN' || alreadyClosed}
                    onClick={() => setRecordingFor(wc)}
                  >
                    Add Records
                  </Button>
                  <Button
                    size="small"
                    disabled={wc.status === 'DOWN' || alreadyClosed}
                    onClick={() => setBoxingFor(wc)}
                  >
                    Add Boxing Record
                  </Button>
                </Flex>
              ),
            },
          ]}
        />
        {alreadyClosed && (
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
            Today's work is closed — no more records can be added.
          </Text>
        )}
      </SectionCard>

      <SectionCard title="Recorded Today">
        <Table<WorkCentreRecordRow>
          rowKey="id"
          loading={recordsLoading}
          dataSource={records}
          pagination={false}
          locale={{ emptyText: 'Nothing recorded at any Work Centre yet today.' }}
          columns={[
            { title: 'Job ID', dataIndex: 'job_id' },
            { title: 'Work Centre', dataIndex: 'work_centre_code' },
            { title: 'Customer', dataIndex: 'customer_name' },
            { title: 'SKU', dataIndex: 'customer_sku_code' },
            {
              title: 'Packed Plates',
              dataIndex: 'packed_plates',
              align: 'right',
              render: (v: number) => v.toLocaleString(),
            },
            {
              title: 'Packed Pouches',
              dataIndex: 'pouches_packed',
              align: 'right',
              render: (v: number) => v.toLocaleString(),
            },
            {
              title: 'Downgraded',
              dataIndex: 'downgraded',
              align: 'right',
              render: (v: number) => v.toLocaleString(),
            },
            {
              title: 'Rejected',
              dataIndex: 'rejected',
              align: 'right',
              render: (v: number) => v.toLocaleString(),
            },
            {
              title: 'Total Plates',
              dataIndex: 'total_plates',
              align: 'right',
              render: (v: number) => v.toLocaleString(),
            },
            {
              title: 'Recorded At',
              dataIndex: 'created_at',
              render: (v: string) => dayjs(v).format('DD MMM, HH:mm'),
            },
          ]}
        />
      </SectionCard>

      <SectionCard title="Boxed Today">
        <Table<BoxingRecordRow>
          rowKey="id"
          loading={boxingRecordsLoading}
          dataSource={boxingRecords}
          pagination={false}
          locale={{ emptyText: 'Nothing boxed at any Work Centre yet today.' }}
          columns={[
            { title: 'Job ID', dataIndex: 'job_id' },
            { title: 'Work Centre', dataIndex: 'work_centre_code' },
            { title: 'Customer', dataIndex: 'customer_name' },
            { title: 'SKU', dataIndex: 'customer_sku_code' },
            {
              title: 'Boxes Packed',
              dataIndex: 'boxes_packed',
              align: 'right',
              render: (v: number) => v.toLocaleString(),
            },
            {
              title: 'Recorded At',
              dataIndex: 'created_at',
              render: (v: string) => dayjs(v).format('DD MMM, HH:mm'),
            },
          ]}
        />
      </SectionCard>

      <AddWorkCentreRecordModal
        open={recordingFor !== null}
        workCentre={recordingFor}
        onClose={() => setRecordingFor(null)}
        onRecorded={() => {
          setRecordingFor(null)
          message.success('Recorded.')
          loadRecords()
          loadReconciliation()
        }}
      />

      <AddBoxingRecordModal
        open={boxingFor !== null}
        workCentre={boxingFor}
        onClose={() => setBoxingFor(null)}
        onRecorded={() => {
          setBoxingFor(null)
          message.success('Recorded.')
          loadBoxingRecords()
          loadReconciliation()
        }}
      />

      <CloseTodayModal
        open={closeModalOpen}
        date={reconciliation?.date ?? null}
        rows={reconciliation?.rows ?? []}
        onClose={() => setCloseModalOpen(false)}
        onClosed={() => {
          setCloseModalOpen(false)
          loadReconciliation()
        }}
      />
    </Flex>
  )
}
