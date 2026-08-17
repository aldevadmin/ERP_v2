import { useCallback, useEffect, useState } from 'react'
import { Button, Progress, Select, Space, Table, Tag, Tooltip, Typography, message } from 'antd'
import { HistoryOutlined, InfoCircleOutlined, PlusOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import SectionCard from '../../shared/components/SectionCard'
import AddFulfilmentTransactionModal from './AddFulfilmentTransactionModal'
import FulfilmentStatusTag, { type FulfilmentReadinessStatus } from './FulfilmentStatusTag'
import {
  listFulfilmentTransactions,
  listProcurementRequirements,
  listProductionRequirements,
  listSkuSupplyPlans,
} from './api'
import type {
  FulfilmentSource,
  FulfilmentTransaction,
  ProcurementRequirementSummary,
  ProductionRequirementSummary,
  SKUSupplyPlanSummary,
} from './types'

const { Text } = Typography

const PAGE_SIZE = 20

interface ReadinessRow {
  export_order_line: number
  line_number: number
  customer_sku_code: string
  product_name: string | null
  plannedSource: string
  planned_qty: number
  cumulative_accepted: number
  balance: number
  progress: number | null
  lastUpdate: string | null
  status: FulfilmentReadinessStatus
}

function formatDateTime(value: string | null): string {
  return value ? dayjs(value).format('DD MMM YYYY, hh:mm A') : '—'
}

function combineReadinessRows(
  production: ProductionRequirementSummary[],
  procurement: ProcurementRequirementSummary[],
  supplyPlans: SKUSupplyPlanSummary[],
): ReadinessRow[] {
  const prodByLine = new Map(production.map((row) => [row.export_order_line, row]))
  const procByLine = new Map(procurement.map((row) => [row.export_order_line, row]))
  const planByLine = new Map(supplyPlans.map((plan) => [plan.export_order_line, plan]))
  const lineIds = new Set([...prodByLine.keys(), ...procByLine.keys()])

  return [...lineIds]
    .map((lineId) => {
      const prod = prodByLine.get(lineId)
      const proc = procByLine.get(lineId)
      const base = (prod ?? proc)!
      const plannedQty = (prod?.planned_qty ?? 0) + (proc?.planned_qty ?? 0)
      const accepted = (prod?.cumulative_accepted ?? 0) + (proc?.cumulative_accepted ?? 0)
      const balance = Math.max(plannedQty - accepted, 0)
      const plannedSource =
        (prod?.planned_qty ?? 0) > 0 && (proc?.planned_qty ?? 0) > 0
          ? 'Production + Procurement'
          : (prod?.planned_qty ?? 0) > 0
            ? 'Production'
            : (proc?.planned_qty ?? 0) > 0
              ? 'Procurement'
              : '—'
      const lastUpdate = [prod?.last_transaction_at, proc?.last_transaction_at]
        .filter((v): v is string => Boolean(v))
        .sort()
        .at(-1)
        ?? null
      const isComplete = plannedQty > 0 && accepted >= plannedQty
      const plan = planByLine.get(lineId)
      const status: FulfilmentReadinessStatus = isComplete ? 'COMPLETE' : (plan?.risk_status ?? 'ON_TRACK')

      return {
        export_order_line: lineId,
        line_number: base.line_number,
        customer_sku_code: base.customer_sku_code,
        product_name: base.product_name,
        plannedSource,
        planned_qty: plannedQty,
        cumulative_accepted: accepted,
        balance,
        progress: plannedQty > 0 ? accepted / plannedQty : null,
        lastUpdate,
        status,
      }
    })
    .sort((a, b) => a.line_number - b.line_number)
}

export default function ExportOrderFulfilmentTab({ exportOrderId }: { exportOrderId: number }) {
  const [readinessRows, setReadinessRows] = useState<ReadinessRow[]>([])
  const [readinessLoading, setReadinessLoading] = useState(true)
  const [readinessSkuFilter, setReadinessSkuFilter] = useState<number | undefined>(undefined)

  const [transactions, setTransactions] = useState<FulfilmentTransaction[]>([])
  const [transactionsTotal, setTransactionsTotal] = useState(0)
  const [transactionsLoading, setTransactionsLoading] = useState(true)
  const [transactionsPage, setTransactionsPage] = useState(1)
  const [transactionsSkuFilter, setTransactionsSkuFilter] = useState<number | undefined>(undefined)

  const [modalOpen, setModalOpen] = useState(false)
  const [modalPrefillSku, setModalPrefillSku] = useState<number | undefined>(undefined)

  const loadReadiness = useCallback(() => {
    setReadinessLoading(true)
    return Promise.all([
      listProductionRequirements(exportOrderId),
      listProcurementRequirements(exportOrderId),
      listSkuSupplyPlans(exportOrderId),
    ])
      .then(([production, procurement, supplyPlans]) =>
        setReadinessRows(combineReadinessRows(production, procurement, supplyPlans)),
      )
      .finally(() => setReadinessLoading(false))
  }, [exportOrderId])

  const loadTransactions = useCallback(() => {
    setTransactionsLoading(true)
    return listFulfilmentTransactions(exportOrderId, {
      line: transactionsSkuFilter,
      page: transactionsPage,
    })
      .then((response) => {
        setTransactions(response.results)
        setTransactionsTotal(response.count)
      })
      .finally(() => setTransactionsLoading(false))
  }, [exportOrderId, transactionsSkuFilter, transactionsPage])

  useEffect(() => {
    loadReadiness()
  }, [loadReadiness])

  useEffect(() => {
    loadTransactions()
  }, [loadTransactions])

  const skuOptions = readinessRows.map((row) => ({
    value: row.export_order_line,
    label: `${row.customer_sku_code}${row.product_name ? ` — ${row.product_name}` : ''}`,
  }))

  const visibleReadinessRows =
    readinessSkuFilter === undefined
      ? readinessRows
      : readinessRows.filter((row) => row.export_order_line === readinessSkuFilter)

  const openModal = (prefillSku?: number) => {
    setModalPrefillSku(prefillSku)
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setModalPrefillSku(undefined)
  }

  const handleCreated = () => {
    message.success('Fulfilment transaction added.')
    closeModal()
    void loadReadiness()
    setTransactionsPage(1)
    void loadTransactions()
  }

  return (
    <>
      <SectionCard
        title={
          <Space>
            <Text strong>SKU Readiness (Accepted Qty drives readiness)</Text>
            <Tooltip title="Readiness is calculated from Accepted Qty only — rejected or pending items are not included.">
              <InfoCircleOutlined style={{ color: '#8c8c8c' }} />
            </Tooltip>
          </Space>
        }
        extra={
          <Space>
            <Select
              aria-label="Filter readiness by SKU"
              allowClear
              placeholder="All SKUs"
              style={{ width: 200 }}
              options={skuOptions}
              value={readinessSkuFilter}
              onChange={setReadinessSkuFilter}
              showSearch
              optionFilterProp="label"
            />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>
              Add Manual Transaction
            </Button>
          </Space>
        }
      >
        <Table<ReadinessRow>
          rowKey="export_order_line"
          loading={readinessLoading}
          dataSource={visibleReadinessRows}
          pagination={false}
          scroll={{ x: 'max-content' }}
          style={{ marginBottom: 16 }}
          columns={[
            {
              title: 'SKU',
              key: 'sku',
              render: (_, record) => (
                <div>
                  <div>{record.customer_sku_code}</div>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {record.product_name || '—'}
                  </Text>
                </div>
              ),
            },
            { title: 'Planned Source', dataIndex: 'plannedSource' },
            {
              title: 'Planned Qty',
              dataIndex: 'planned_qty',
              render: (v: number) => `${v.toLocaleString()} pcs`,
            },
            {
              title: 'Accepted Qty',
              dataIndex: 'cumulative_accepted',
              render: (v: number) => (
                <Text style={{ color: '#389e0d' }}>{v.toLocaleString()} pcs</Text>
              ),
            },
            {
              title: 'Balance',
              dataIndex: 'balance',
              render: (v: number) => (
                <Text strong={v > 0} type={v > 0 ? 'danger' : undefined}>
                  {v.toLocaleString()} pcs
                </Text>
              ),
            },
            {
              title: 'Last Update',
              dataIndex: 'lastUpdate',
              render: (v: string | null) => formatDateTime(v),
            },
            {
              title: 'Readiness',
              dataIndex: 'progress',
              render: (v: number | null) => (
                <Progress
                  percent={v === null ? 0 : Math.round(v * 100)}
                  size="small"
                  status={v !== null && v >= 1 ? 'success' : 'active'}
                  style={{ width: 140 }}
                />
              ),
            },
            {
              title: 'Status',
              dataIndex: 'status',
              render: (v: FulfilmentReadinessStatus) => <FulfilmentStatusTag status={v} />,
            },
            {
              title: 'Actions',
              key: 'actions',
              render: (_, record) => (
                <Button
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={() => openModal(record.export_order_line)}
                >
                  Add Transaction
                </Button>
              ),
            },
          ]}
        />
        <Text type="secondary" style={{ fontSize: 12 }}>
          <InfoCircleOutlined /> Readiness is calculated based on accepted quantity only. Rejected
          or pending items are not included.
        </Text>
      </SectionCard>

      <SectionCard
        style={{ marginTop: 20 }}
        title={
          <div>
            <Text strong>Recent Fulfilment Transactions</Text>
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Manual entries can be added per SKU from the readiness table.
              </Text>
            </div>
          </div>
        }
        extra={
          <Space>
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
            <Button
              icon={<HistoryOutlined />}
              onClick={() => message.info("Full history export isn't available yet.")}
            >
              View History
            </Button>
          </Space>
        }
      >
        <Table<FulfilmentTransaction>
          rowKey="id"
          loading={transactionsLoading}
          dataSource={transactions}
          scroll={{ x: 'max-content' }}
          pagination={{
            current: transactionsPage,
            pageSize: PAGE_SIZE,
            total: transactionsTotal,
            showTotal: (total) => `Total ${total} records`,
            showQuickJumper: true,
            showSizeChanger: false,
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
                    {record.product_name || '—'}
                  </Text>
                </div>
              ),
            },
            {
              title: 'Source',
              dataIndex: 'source',
              render: (v: FulfilmentSource) => (
                <Tag color={v === 'PRODUCTION' ? 'blue' : 'purple'}>
                  {v === 'PRODUCTION' ? 'Production' : 'Procurement'}
                </Tag>
              ),
            },
            { title: 'Party / Team', dataIndex: 'party_team', render: (v: string) => v || '—' },
            {
              title: 'Received or Produced',
              dataIndex: 'quantity',
              render: (v: number) => `${v.toLocaleString()} pcs`,
            },
            {
              title: 'Accepted',
              dataIndex: 'quantity_accepted',
              render: (v: number) => (
                <Text style={{ color: '#389e0d' }}>{v.toLocaleString()} pcs</Text>
              ),
            },
            {
              title: 'Rejected',
              dataIndex: 'quantity_rejected',
              render: (v: number) => (
                <Text type={v > 0 ? 'danger' : undefined}>{v.toLocaleString()} pcs</Text>
              ),
            },
            { title: 'Remarks', dataIndex: 'remarks', render: (v: string) => v || '—' },
            { title: 'Recorded By', dataIndex: 'entered_by', render: (v: string | null) => v || '—' },
          ]}
        />
      </SectionCard>

      <AddFulfilmentTransactionModal
        open={modalOpen}
        exportOrderId={exportOrderId}
        skuOptions={skuOptions}
        prefillSku={modalPrefillSku}
        onClose={closeModal}
        onCreated={handleCreated}
      />
    </>
  )
}
