import { useCallback, useEffect, useState } from 'react'
import {
  Button,
  Card,
  Collapse,
  Empty,
  Progress,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd'
import { InboxOutlined, InfoCircleOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import SectionCard from '../../shared/components/SectionCard'
import AddLoadingTransactionModal from './AddLoadingTransactionModal'
import AddToShipmentModal from './AddToShipmentModal'
import FulfilmentStatusTag, { type FulfilmentReadinessStatus } from './FulfilmentStatusTag'
import {
  listExportOrderLines,
  listLoadingTransactionsLog,
  listShipmentLines,
  listShipments,
  listSkuSupplyPlans,
} from './api'
import type {
  ExportOrderLine,
  LoadingTransactionLogEntry,
  Shipment,
  ShipmentLine,
  SKUSupplyPlanSummary,
} from './types'

const { Text } = Typography

/** One readiness-table row — either a real `ShipmentLine` already planned
 * onto the selected shipment, or an order line with no allocation there
 * yet (`shipmentLine: null`) — surfaced instead of silently omitted, so a
 * SKU never just vanishes from the tab because nobody's planned it onto
 * this shipment (business-rules.md §7 / ui-spec.md §8).
 */
interface ReadinessRow {
  key: string
  exportOrderLineId: number
  customer_sku_code: string
  item_name: string | null
  item_code: string | null
  required_cartons: number | null
  shipmentLine: ShipmentLine | null
}

function formatDateTime(value: string | null): string {
  return value ? dayjs(value).format('DD MMM YYYY, hh:mm A') : '—'
}

function computeStatus(
  row: ShipmentLine,
  plan: SKUSupplyPlanSummary | undefined,
): FulfilmentReadinessStatus {
  const isComplete = row.planned_qty > 0 && row.actual_loaded_qty >= row.planned_qty
  return isComplete ? 'COMPLETE' : (plan?.risk_status ?? 'ON_TRACK')
}

export default function ExportOrderLoadingTab({ exportOrderId }: { exportOrderId: number }) {
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [shipmentsLoading, setShipmentsLoading] = useState(true)
  const [selectedShipmentId, setSelectedShipmentId] = useState<number | null>(null)

  const [lines, setLines] = useState<ShipmentLine[]>([])
  const [linesLoading, setLinesLoading] = useState(false)
  const [supplyPlans, setSupplyPlans] = useState<SKUSupplyPlanSummary[]>([])
  const [allOrderLines, setAllOrderLines] = useState<ExportOrderLine[]>([])

  const [transactions, setTransactions] = useState<LoadingTransactionLogEntry[]>([])
  const [transactionsTotal, setTransactionsTotal] = useState(0)
  const [transactionsLoading, setTransactionsLoading] = useState(true)
  const [transactionsPage, setTransactionsPage] = useState(1)
  const [transactionsSkuFilter, setTransactionsSkuFilter] = useState<number | undefined>(undefined)

  const [editingLine, setEditingLine] = useState<ShipmentLine | null>(null)
  const [addingOrderLine, setAddingOrderLine] = useState<ExportOrderLine | null>(null)

  useEffect(() => {
    setShipmentsLoading(true)
    listShipments(exportOrderId)
      .then((data) => {
        setShipments(data)
        setSelectedShipmentId((prev) => prev ?? data[0]?.id ?? null)
      })
      .finally(() => setShipmentsLoading(false))
  }, [exportOrderId])

  useEffect(() => {
    listExportOrderLines(exportOrderId).then(setAllOrderLines)
  }, [exportOrderId])

  const loadLines = useCallback(() => {
    if (selectedShipmentId === null) return
    setLinesLoading(true)
    return Promise.all([
      listShipmentLines(exportOrderId, selectedShipmentId),
      listSkuSupplyPlans(exportOrderId),
    ])
      .then(([lineData, plans]) => {
        setLines(lineData)
        setSupplyPlans(plans)
      })
      .finally(() => setLinesLoading(false))
  }, [exportOrderId, selectedShipmentId])

  useEffect(() => {
    loadLines()
  }, [loadLines])

  const loadTransactions = useCallback(() => {
    if (selectedShipmentId === null) return
    setTransactionsLoading(true)
    return listLoadingTransactionsLog(exportOrderId, selectedShipmentId, {
      line: transactionsSkuFilter,
      page: transactionsPage,
      pageSize: 10,
    })
      .then((response) => {
        setTransactions(response.results)
        setTransactionsTotal(response.count)
      })
      .finally(() => setTransactionsLoading(false))
  }, [exportOrderId, selectedShipmentId, transactionsSkuFilter, transactionsPage])

  useEffect(() => {
    loadTransactions()
  }, [loadTransactions])

  const planByLine = new Map(supplyPlans.map((plan) => [plan.export_order_line, plan]))

  const plannedOrderLineIds = new Set(lines.map((l) => l.export_order_line))
  const readinessRows: ReadinessRow[] = [
    ...lines.map((l) => ({
      key: `planned-${l.id}`,
      exportOrderLineId: l.export_order_line,
      customer_sku_code: l.customer_sku_code,
      item_name: l.item_name,
      item_code: l.item_code,
      required_cartons: l.required_cartons,
      shipmentLine: l,
    })),
    ...allOrderLines
      .filter((ol) => !plannedOrderLineIds.has(ol.id))
      .map((ol) => ({
        key: `unplanned-${ol.id}`,
        exportOrderLineId: ol.id,
        customer_sku_code: ol.customer_sku_code,
        item_name: ol.item_name,
        item_code: ol.item_code,
        required_cartons: ol.required_cartons,
        shipmentLine: null,
      })),
  ]

  const skuOptions = lines.map((line) => ({
    value: line.export_order_line,
    label: `${line.customer_sku_code}${line.item_name ? ` — ${line.item_name}` : ''}`,
  }))

  const closeModal = () => setEditingLine(null)
  const closeAddToShipmentModal = () => setAddingOrderLine(null)

  const handleCreated = () => {
    message.success('Loading updated.')
    closeModal()
    void loadLines()
    setTransactionsPage(1)
    void loadTransactions()
  }

  const handleAddedToShipment = () => {
    message.success('Added to shipment.')
    closeAddToShipmentModal()
    void loadLines()
  }

  const selectedShipment = shipments.find((s) => s.id === selectedShipmentId) ?? null

  const totalCartonsLoaded = lines.reduce((sum, l) => sum + l.actual_loaded_cartons, 0)
  const totalPouchesLoaded = lines.reduce((sum, l) => sum + l.loaded_pouches, 0)
  const totalNetWeight = lines.reduce((sum, l) => sum + (l.net_weight_kg ?? 0), 0)
  const totalGrossWeight = lines.reduce((sum, l) => sum + (l.gross_weight_kg ?? 0), 0)

  if (!shipmentsLoading && shipments.length === 0) {
    return (
      <SectionCard title="Loading">
        <Empty description="Create a shipment first, in the Shipping tab." style={{ paddingTop: 24 }} />
      </SectionCard>
    )
  }

  return (
    <>
      <SectionCard
        title={
          <Space>
            <Text strong>SKU Loading Readiness</Text>
            <Tooltip title="Loadable Qty is this shipment's planned allocation. Loaded Qty is calculated from logged transactions.">
              <InfoCircleOutlined style={{ color: '#8c8c8c' }} />
            </Tooltip>
          </Space>
        }
        extra={
          <Select
            aria-label="Select shipment"
            loading={shipmentsLoading}
            value={selectedShipmentId ?? undefined}
            onChange={setSelectedShipmentId}
            style={{ width: 320 }}
            options={shipments.map((s) => ({
              value: s.id,
              label: `${s.shipment_number}${s.container_number ? ` — ${s.container_number}` : ''}`,
            }))}
          />
        }
      >
        <Table<ReadinessRow>
          rowKey="key"
          loading={linesLoading}
          dataSource={readinessRows}
          pagination={false}
          scroll={{ x: 'max-content' }}
          style={{ marginBottom: 16 }}
          locale={{ emptyText: 'No SKUs on this order yet.' }}
          columns={[
            {
              title: 'SKU',
              key: 'sku',
              render: (_, record) => (
                <div>
                  <div>{record.customer_sku_code}</div>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {record.item_name || record.item_code || '—'}
                  </Text>
                </div>
              ),
            },
            {
              title: 'Required Qty (Boxes)',
              dataIndex: 'required_cartons',
              render: (v: number | null) => (v === null ? '—' : `${v.toLocaleString()} boxes`),
            },
            {
              title: 'Loadable Qty',
              key: 'loadable',
              render: (_, record) =>
                record.shipmentLine ? `${record.shipmentLine.planned_qty.toLocaleString()} pcs` : '—',
            },
            {
              title: 'Loaded Qty',
              key: 'loaded',
              render: (_, record) =>
                record.shipmentLine ? (
                  <Text style={{ color: '#389e0d' }}>
                    {record.shipmentLine.actual_loaded_qty.toLocaleString()} pcs
                  </Text>
                ) : (
                  '—'
                ),
            },
            {
              title: 'Balance',
              key: 'balance',
              render: (_, record) => {
                if (!record.shipmentLine) return '—'
                const balance = record.shipmentLine.planned_qty - record.shipmentLine.actual_loaded_qty
                return (
                  <Text strong={balance > 0} type={balance > 0 ? 'danger' : undefined}>
                    {balance.toLocaleString()} pcs
                  </Text>
                )
              },
            },
            {
              title: 'Last Update',
              key: 'lastUpdate',
              render: (_, record) =>
                formatDateTime(record.shipmentLine?.last_loading_transaction_at ?? null),
            },
            {
              title: 'Progress',
              key: 'progress',
              render: (_, record) => {
                if (!record.shipmentLine) return '—'
                const { planned_qty, actual_loaded_qty } = record.shipmentLine
                const percent = planned_qty > 0 ? Math.round((actual_loaded_qty / planned_qty) * 100) : 0
                return (
                  <Progress
                    percent={percent}
                    size="small"
                    status={percent >= 100 ? 'success' : 'active'}
                    style={{ width: 140 }}
                  />
                )
              },
            },
            {
              title: 'Status',
              key: 'status',
              render: (_, record) =>
                record.shipmentLine ? (
                  <FulfilmentStatusTag
                    status={computeStatus(record.shipmentLine, planByLine.get(record.exportOrderLineId))}
                  />
                ) : (
                  <Tag>Not Planned</Tag>
                ),
            },
            {
              title: 'Actions',
              key: 'actions',
              render: (_, record) =>
                record.shipmentLine ? (
                  <Button
                    type="primary"
                    size="small"
                    disabled={record.shipmentLine.planned_cartons === null}
                    onClick={() => setEditingLine(record.shipmentLine)}
                  >
                    Update Loading
                  </Button>
                ) : (
                  <Button
                    size="small"
                    onClick={() => {
                      const orderLine = allOrderLines.find((ol) => ol.id === record.exportOrderLineId)
                      if (orderLine) setAddingOrderLine(orderLine)
                    }}
                  >
                    Add to Shipment
                  </Button>
                ),
            },
          ]}
        />
      </SectionCard>

      <Collapse
        style={{ marginTop: 20 }}
        items={[
          {
            key: 'loading-transactions',
            label: <Text strong>Loading Transactions</Text>,
            children: (
              <>
                <Space style={{ marginBottom: 16 }}>
                  <Select
                    aria-label="Filter transactions by SKU"
                    allowClear
                    placeholder="All SKUs"
                    style={{ width: 200 }}
                    options={skuOptions}
                    value={transactionsSkuFilter}
                    onChange={(value) => {
                      setTransactionsSkuFilter(value)
                      setTransactionsPage(1)
                    }}
                    showSearch
                    optionFilterProp="label"
                  />
                </Space>
                <Table<LoadingTransactionLogEntry>
                  rowKey="id"
                  loading={transactionsLoading}
                  dataSource={transactions}
                  scroll={{ x: 'max-content' }}
                  pagination={{
                    current: transactionsPage,
                    pageSize: 10,
                    total: transactionsTotal,
                    showTotal: (total) => `Total ${total} records`,
                    onChange: setTransactionsPage,
                  }}
                  columns={[
                    { title: 'Date', dataIndex: 'date' },
                    {
                      title: 'SKU',
                      key: 'sku',
                      render: (_, record) => (
                        <div>
                          <div>{record.customer_sku_code}</div>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {record.item_name || '—'}
                          </Text>
                        </div>
                      ),
                    },
                    {
                      title: 'Cartons',
                      dataIndex: 'cartons_loaded',
                      render: (v: number | null) => (v === null ? '-' : v.toLocaleString()),
                    },
                    {
                      title: 'Pouches',
                      dataIndex: 'pouches_loaded',
                      render: (v: number | null) => (v === null ? '-' : v.toLocaleString()),
                    },
                    {
                      title: 'Pieces',
                      dataIndex: 'calculated_pieces',
                      render: (v: number) => `${v.toLocaleString()} pcs`,
                    },
                    {
                      title: 'Reason',
                      dataIndex: 'variance_reason',
                      render: (v: string) => v || '—',
                    },
                    { title: 'Remarks', dataIndex: 'remarks', render: (v: string) => v || '—' },
                  ]}
                />
              </>
            ),
          },
        ]}
      />

      <div style={{ display: 'flex', gap: 20, marginTop: 20, flexWrap: 'wrap' }}>
        <Card
          title="Container Loading Details"
          style={{ flex: 1, minWidth: 280, borderRadius: 12 }}
        >
          <Space direction="vertical" style={{ width: '100%' }}>
            <Space style={{ justifyContent: 'space-between', width: '100%' }}>
              <Text type="secondary">
                <InboxOutlined /> Container No.
              </Text>
              <Text strong>{selectedShipment?.container_number || '—'}</Text>
            </Space>
            <Space style={{ justifyContent: 'space-between', width: '100%' }}>
              <Text type="secondary">Stuffing Date</Text>
              <Text strong>{selectedShipment?.planned_stuffing_date ?? '—'}</Text>
            </Space>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Vehicle No., Seal No., Loading Date, and VGM aren't available yet — planned for the
              full Shipping buildout.
            </Text>
          </Space>
        </Card>

        <Card title="Loading Summary" style={{ flex: 1, minWidth: 280, borderRadius: 12 }}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Space style={{ justifyContent: 'space-between', width: '100%' }}>
              <Text type="secondary">Total Cartons Loaded</Text>
              <Text strong>{totalCartonsLoaded.toLocaleString()} cartons</Text>
            </Space>
            <Space style={{ justifyContent: 'space-between', width: '100%' }}>
              <Text type="secondary">Total Pouches Loaded</Text>
              <Text strong>{totalPouchesLoaded.toLocaleString()} pouches</Text>
            </Space>
            <Space style={{ justifyContent: 'space-between', width: '100%' }}>
              <Text type="secondary">Total Net Weight</Text>
              <Text strong>{totalNetWeight.toLocaleString()} kg</Text>
            </Space>
            <Space style={{ justifyContent: 'space-between', width: '100%' }}>
              <Text type="secondary">Total Gross Weight</Text>
              <Text strong>{totalGrossWeight.toLocaleString()} kg</Text>
            </Space>
          </Space>
        </Card>

        {/* Static for this pass — no backend state yet. Fixed display
            only; not wired to checked_by/checked_at or any persistence.
            Full implementation (real checklist, toggleable, tracked)
            is planned for a later pass. */}
        <Card title="Loading Checklist" style={{ flex: 1, minWidth: 280, borderRadius: 12 }}>
          <Space direction="vertical" style={{ width: '100%' }}>
            {[
              'Container inspected',
              'Pallets arranged',
              'Cartons loaded',
              'VGM completed',
              'Seal applied',
            ].map((item) => (
              <Space key={item} style={{ justifyContent: 'space-between', width: '100%' }}>
                <Text>{item}</Text>
                <Tag color="success">Completed</Tag>
              </Space>
            ))}
          </Space>
        </Card>
      </div>

      <AddToShipmentModal
        open={addingOrderLine !== null}
        exportOrderId={exportOrderId}
        shipmentId={selectedShipmentId ?? 0}
        orderLine={addingOrderLine}
        onClose={closeAddToShipmentModal}
        onCreated={handleAddedToShipment}
      />

      <AddLoadingTransactionModal
        open={editingLine !== null}
        exportOrderId={exportOrderId}
        shipmentId={selectedShipmentId ?? 0}
        shipmentLine={editingLine}
        onClose={closeModal}
        onCreated={handleCreated}
      />
    </>
  )
}
