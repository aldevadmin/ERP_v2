import { useEffect, useMemo, useState } from 'react'
import { Badge, Button, Select, Space, Table, Tag, message } from 'antd'
import dayjs from 'dayjs'
import { ApiError } from '../../shared/api/http'
import { listCustomers } from '../customers/api'
import type { Customer } from '../customers/types'
import SectionCard from '../../shared/components/SectionCard'
import OrdersSelectedDrawer from './OrdersSelectedDrawer'
import { listPackingAllotments, listPackingLines, selectPackingLine, setPackingLineHold } from './api'
import type { PackingLineRow, PackingLineStatus } from './types'

const STATUS_OPTIONS: { value: PackingLineStatus; label: string }[] = [
  { value: 'BACKLOG', label: 'Backlog' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'ON_HOLD', label: 'On Hold' },
  { value: 'COMPLETED', label: 'Completed' },
]

const STATUS_COLORS: Record<PackingLineStatus, string> = {
  BACKLOG: 'default',
  IN_PROGRESS: 'processing',
  ON_HOLD: 'orange',
  COMPLETED: 'green',
}

export default function AllOrdersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [customerId, setCustomerId] = useState<number | undefined>(undefined)
  const [orderNo, setOrderNo] = useState<string | undefined>(undefined)
  const [rows, setRows] = useState<PackingLineRow[]>([])
  const [loading, setLoading] = useState(true)
  const [stagedLineIds, setStagedLineIds] = useState<Set<number>>(new Set())
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    listCustomers({ isActive: true }).then((response) => setCustomers(response.results))
  }, [])

  const loadStaged = () => {
    listPackingAllotments({ status: 'DRAFT' }).then((allotments) =>
      setStagedLineIds(new Set(allotments.map((a) => a.export_order_line))),
    )
  }

  useEffect(loadStaged, [])

  const handleSelect = async (row: PackingLineRow) => {
    try {
      await selectPackingLine(row.export_order_line)
      setStagedLineIds((prev) => new Set(prev).add(row.export_order_line))
      message.success(`${row.customer_sku_code} added to today's plan.`)
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : 'Could not select this line.')
    }
  }

  const load = () => {
    setLoading(true)
    listPackingLines(customerId)
      .then(setRows)
      .catch((err) => message.error(err instanceof ApiError ? err.message : 'Could not load orders.'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [customerId])

  // Order # options narrow to whichever customer is selected — reset the
  // chosen order whenever the customer changes since it may no longer
  // apply.
  useEffect(() => setOrderNo(undefined), [customerId])
  const orderOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.order_no))).map((order_no) => ({ value: order_no, label: order_no })),
    [rows],
  )
  const filteredRows = orderNo ? rows.filter((r) => r.order_no === orderNo) : rows

  const handleStatusChange = async (row: PackingLineRow, value: PackingLineStatus) => {
    try {
      const updated = await setPackingLineHold(row.export_order_line, value === 'ON_HOLD')
      setRows((prev) => prev.map((r) => (r.export_order_line === row.export_order_line ? updated : r)))
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : 'Could not update this line.')
    }
  }

  return (
    <SectionCard
      title="All Orders"
      extra={
        <Space>
          <Select
            style={{ width: 220 }}
            value={customerId}
            onChange={setCustomerId}
            allowClear
            placeholder="All customers"
            options={customers.map((c) => ({ value: c.id, label: c.name }))}
          />
          <Select
            style={{ width: 200 }}
            value={orderNo}
            onChange={setOrderNo}
            allowClear
            placeholder="All orders"
            options={orderOptions}
          />
          <Badge count={stagedLineIds.size} showZero={false}>
            <Button onClick={() => setDrawerOpen(true)}>Orders Selected</Button>
          </Badge>
        </Space>
      }
    >
      <Table<PackingLineRow>
        rowKey="export_order_line"
        loading={loading}
        dataSource={filteredRows}
        pagination={false}
        locale={{ emptyText: 'No orders found.' }}
        columns={[
          { title: 'Customer', dataIndex: 'customer_name' },
          { title: 'Order #', dataIndex: 'order_no' },
          { title: 'SKU', dataIndex: 'customer_sku_code' },
          {
            title: 'Required Quantity (in pieces)',
            dataIndex: 'required_pieces',
            align: 'right',
            render: (v: number) => v.toLocaleString(),
          },
          {
            title: 'Required Quantity (in Cartons)',
            dataIndex: 'required_cartons',
            align: 'right',
            render: (v: number) => v.toLocaleString(),
          },
          {
            title: 'Packed Quantity (in Cartons)',
            dataIndex: 'packed_cartons',
            align: 'right',
            render: (v: number) => v.toLocaleString(),
          },
          {
            title: 'Pending',
            dataIndex: 'pending_cartons',
            align: 'right',
            render: (v: number) => v.toLocaleString(),
          },
          {
            title: 'Status',
            dataIndex: 'status',
            render: (status: PackingLineStatus, row) => (
              <Select<PackingLineStatus>
                size="small"
                value={status}
                style={{ width: 140 }}
                variant="borderless"
                onChange={(value) => void handleStatusChange(row, value)}
                options={STATUS_OPTIONS.map((option) => ({
                  ...option,
                  disabled: option.value !== 'ON_HOLD' && status !== 'ON_HOLD',
                  label: <Tag color={STATUS_COLORS[option.value]}>{option.label}</Tag>,
                }))}
              />
            ),
          },
          {
            title: 'Last Updated',
            dataIndex: 'last_updated_at',
            render: (v: string | null) => (v ? dayjs(v).format('DD MMM YYYY, HH:mm') : '—'),
          },
          {
            title: '',
            key: 'select',
            render: (_, row) => {
              if (row.status === 'COMPLETED') return null
              const staged = stagedLineIds.has(row.export_order_line)
              return (
                <Button
                  size="small"
                  disabled={staged}
                  onClick={() => void handleSelect(row)}
                >
                  {staged ? 'Selected' : 'Select'}
                </Button>
              )
            },
          },
        ]}
      />
      <OrdersSelectedDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onChanged={loadStaged}
      />
    </SectionCard>
  )
}
