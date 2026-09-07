import { useCallback, useEffect, useState } from 'react'
import { Button, Card, Checkbox, Flex, Input, Progress, Select, Table, Tag, Typography } from 'antd'
import { listPackingOrders } from './api'
import PlanPackingModal from './PlanPackingModal'
import type { PackingDemandRow, PackingDemandStatus } from './types'

const { Title } = Typography

const STATUS_COLORS: Record<PackingDemandStatus, string> = {
  UNPLANNED: 'default',
  PLANNED: 'blue',
  PART_PACKED: 'orange',
  COMPLETE: 'green',
}

const STATUS_LABELS: Record<PackingDemandStatus, string> = {
  UNPLANNED: 'Unplanned',
  PLANNED: 'Planned',
  PART_PACKED: 'Part Packed',
  COMPLETE: 'Complete',
}

export default function PackingOrdersPage() {
  const [rows, setRows] = useState<PackingDemandRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<string | undefined>(undefined)
  const [unplannedOnly, setUnplannedOnly] = useState(false)
  const [planningRow, setPlanningRow] = useState<PackingDemandRow | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    listPackingOrders({ search: search || undefined, status, unplannedOnly })
      .then((response) => setRows(response.results))
      .finally(() => setLoading(false))
  }, [search, status, unplannedOnly])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div>
      <Card
        title={
          <Title level={4} style={{ margin: 0 }}>
            Packing Orders
          </Title>
        }
      >
        <Flex justify="space-between" style={{ marginBottom: 16 }} wrap="wrap" gap={12}>
          <Input.Search
            placeholder="Search order, SKU, customer SKU..."
            allowClear
            style={{ maxWidth: 320 }}
            onSearch={setSearch}
          />
          <Flex gap={12} wrap="wrap" align="center">
            <Select
              aria-label="Status"
              placeholder="Status"
              allowClear
              style={{ width: 160 }}
              value={status}
              onChange={setStatus}
              options={[
                { value: 'UNPLANNED', label: 'Unplanned' },
                { value: 'PLANNED', label: 'Planned' },
                { value: 'PART_PACKED', label: 'Part Packed' },
                { value: 'COMPLETE', label: 'Complete' },
              ]}
            />
            <Checkbox checked={unplannedOnly} onChange={(e) => setUnplannedOnly(e.target.checked)}>
              Show Unplanned Only
            </Checkbox>
          </Flex>
        </Flex>
        <Table<PackingDemandRow>
          rowKey="export_order_line_id"
          loading={loading}
          dataSource={rows}
          columns={[
            { title: 'Order', dataIndex: 'order_no', width: 110 },
            { title: 'Customer', dataIndex: 'customer_name' },
            {
              title: 'SKU',
              key: 'sku',
              render: (_, r) => `${r.item_name} (${r.item_code})`,
            },
            {
              title: 'Required',
              dataIndex: 'required_qty',
              width: 100,
              render: (v: number) => v.toLocaleString(),
            },
            {
              title: 'Packable',
              dataIndex: 'packable_qty',
              width: 100,
              render: (v: number) => v.toLocaleString(),
            },
            {
              title: 'Packed',
              dataIndex: 'packed_qty',
              width: 100,
              render: (v: number) => v.toLocaleString(),
            },
            {
              title: 'Balance',
              dataIndex: 'balance_qty',
              width: 100,
              render: (v: number) => v.toLocaleString(),
            },
            {
              title: 'Planned',
              dataIndex: 'planned_qty',
              width: 100,
              render: (v: number) => v.toLocaleString(),
            },
            {
              title: 'Unplanned',
              dataIndex: 'unplanned_qty',
              width: 100,
              render: (v: number) => v.toLocaleString(),
            },
            {
              title: 'Due',
              dataIndex: 'packing_due_date',
              width: 100,
              render: (v: string | null) => v ?? '—',
            },
            {
              title: 'Status',
              dataIndex: 'status',
              width: 130,
              render: (v: PackingDemandStatus) => <Tag color={STATUS_COLORS[v]}>{STATUS_LABELS[v]}</Tag>,
            },
            {
              title: '',
              key: 'actions',
              width: 90,
              render: (_, r) =>
                r.status === 'COMPLETE' ? (
                  <Button size="small" disabled>
                    Complete
                  </Button>
                ) : (
                  <Button size="small" type="primary" onClick={() => setPlanningRow(r)}>
                    Plan
                  </Button>
                ),
            },
          ]}
          expandable={{
            expandedRowRender: (r) => (
              <Progress
                percent={Math.round((r.packed_qty / (r.required_qty || 1)) * 100)}
                size="small"
              />
            ),
          }}
        />
      </Card>
      <PlanPackingModal
        open={planningRow !== null}
        row={planningRow}
        onClose={() => setPlanningRow(null)}
        onCreated={() => {
          setPlanningRow(null)
          load()
        }}
      />
    </div>
  )
}
