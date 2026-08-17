import { useCallback, useEffect, useState } from 'react'
import { Button, Progress, Select, Space, Table, Tooltip, Typography, message } from 'antd'
import { HistoryOutlined, InfoCircleOutlined, PlusOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import SectionCard from '../../shared/components/SectionCard'
import AddPackingTransactionModal from './AddPackingTransactionModal'
import FulfilmentStatusTag, { type FulfilmentReadinessStatus } from './FulfilmentStatusTag'
import { listPackingMonitor, listPackingTransactionsLog, listSkuSupplyPlans } from './api'
import type { PackingMonitorRow, PackingTransactionLogEntry, SKUSupplyPlanSummary } from './types'

const { Text } = Typography

const PAGE_SIZE_OPTIONS = ['10', '20', '50']

function formatDateTime(value: string | null): string {
  return value ? dayjs(value).format('DD MMM YYYY, hh:mm A') : '—'
}

function computeStatus(
  row: PackingMonitorRow,
  plan: SKUSupplyPlanSummary | undefined,
): FulfilmentReadinessStatus {
  const isComplete = row.packable_qty > 0 && row.packed_pieces >= row.packable_qty
  return isComplete ? 'COMPLETE' : (plan?.risk_status ?? 'ON_TRACK')
}

export default function ExportOrderPackingTab({ exportOrderId }: { exportOrderId: number }) {
  const [readinessRows, setReadinessRows] = useState<PackingMonitorRow[]>([])
  const [readinessLoading, setReadinessLoading] = useState(true)
  const [readinessSkuFilter, setReadinessSkuFilter] = useState<number | undefined>(undefined)
  const [supplyPlans, setSupplyPlans] = useState<SKUSupplyPlanSummary[]>([])

  const [transactions, setTransactions] = useState<PackingTransactionLogEntry[]>([])
  const [transactionsTotal, setTransactionsTotal] = useState(0)
  const [transactionsLoading, setTransactionsLoading] = useState(true)
  const [transactionsPage, setTransactionsPage] = useState(1)
  const [transactionsPageSize, setTransactionsPageSize] = useState(10)
  const [transactionsSkuFilter, setTransactionsSkuFilter] = useState<number | undefined>(undefined)

  const [modalOpen, setModalOpen] = useState(false)
  const [modalPrefillSku, setModalPrefillSku] = useState<number | undefined>(undefined)

  const loadReadiness = useCallback(() => {
    setReadinessLoading(true)
    return Promise.all([listPackingMonitor(exportOrderId), listSkuSupplyPlans(exportOrderId)])
      .then(([rows, plans]) => {
        setReadinessRows(rows)
        setSupplyPlans(plans)
      })
      .finally(() => setReadinessLoading(false))
  }, [exportOrderId])

  const loadTransactions = useCallback(() => {
    setTransactionsLoading(true)
    return listPackingTransactionsLog(exportOrderId, {
      line: transactionsSkuFilter,
      page: transactionsPage,
      pageSize: transactionsPageSize,
    })
      .then((response) => {
        setTransactions(response.results)
        setTransactionsTotal(response.count)
      })
      .finally(() => setTransactionsLoading(false))
  }, [exportOrderId, transactionsSkuFilter, transactionsPage, transactionsPageSize])

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

  const planByLine = new Map(supplyPlans.map((plan) => [plan.export_order_line, plan]))

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
    message.success('Packing transaction added.')
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
            <Text strong>SKU Packing Readiness</Text>
            <Tooltip title="Packable Qty is the order's required piece quantity. Packed Qty is calculated from logged transactions.">
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
        <Table<PackingMonitorRow>
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
            {
              title: 'Packable Qty',
              dataIndex: 'packable_qty',
              render: (v: number) => `${v.toLocaleString()} pcs`,
            },
            {
              title: 'Packed Qty',
              dataIndex: 'packed_pieces',
              render: (v: number) => (
                <Text style={{ color: '#389e0d' }}>{v.toLocaleString()} pcs</Text>
              ),
            },
            {
              title: 'Balance',
              dataIndex: 'balance_pieces',
              render: (v: number) => (
                <Text strong={v > 0} type={v > 0 ? 'danger' : undefined}>
                  {v.toLocaleString()} pcs
                </Text>
              ),
            },
            {
              title: 'Last Update',
              dataIndex: 'last_transaction_at',
              render: (v: string | null) => formatDateTime(v),
            },
            {
              title: 'Progress',
              dataIndex: 'progress_pieces',
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
              key: 'status',
              render: (_, record) => (
                <FulfilmentStatusTag
                  status={computeStatus(record, planByLine.get(record.export_order_line))}
                />
              ),
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
          <InfoCircleOutlined /> Packing progress is calculated from manual packing transactions.
          Transactions can be added per SKU.
        </Text>
      </SectionCard>

      <SectionCard
        style={{ marginTop: 20 }}
        title={
          <div>
            <Text strong>Recent Packing Transactions</Text>
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
        <Table<PackingTransactionLogEntry>
          rowKey="id"
          loading={transactionsLoading}
          dataSource={transactions}
          scroll={{ x: 'max-content' }}
          pagination={{
            current: transactionsPage,
            pageSize: transactionsPageSize,
            total: transactionsTotal,
            showTotal: (total) => `Total ${total} records`,
            showQuickJumper: true,
            showSizeChanger: true,
            pageSizeOptions: PAGE_SIZE_OPTIONS,
            onChange: (page, pageSize) => {
              setTransactionsPage(page)
              setTransactionsPageSize(pageSize)
            },
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
              title: 'Pouches',
              dataIndex: 'pouches_packed',
              render: (v: number | null) => (v === null ? '-' : v.toLocaleString()),
            },
            {
              title: 'Cartons',
              dataIndex: 'cartons_packed',
              render: (v: number | null) => (v === null ? '-' : v.toLocaleString()),
            },
            {
              title: 'Pieces',
              dataIndex: 'calculated_pieces',
              render: (v: number) => `${v.toLocaleString()} pcs`,
            },
            {
              title: 'Packed By',
              key: 'packed_by',
              render: (_, record) => record.packed_by_detail?.full_name || '—',
            },
            { title: 'Remarks', dataIndex: 'remarks', render: (v: string) => v || '—' },
          ]}
        />
      </SectionCard>

      <AddPackingTransactionModal
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
