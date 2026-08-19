import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Flex, InputNumber, Space, Table, Typography, message } from 'antd'
import { FileExcelOutlined, ReloadOutlined, ShoppingOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import SectionCard from '../../shared/components/SectionCard'
import { ApiError } from '../../shared/api/http'
import {
  listPackingMaterialRequirements,
  listSkuSupplyPlans,
  updatePackingMaterialRequirement,
  updateSkuSupplyPlan,
} from './api'
import { PACKING_MATERIAL_TABS } from './types'
import type {
  PackingMaterialRequirementFormValues,
  PackingMaterialRequirementSummary,
  PackingMaterialType,
  SKUSupplyPlanSummary,
} from './types'

const { Text } = Typography

interface MaterialRow {
  key: string
  exportOrderLine: number
  materialType: PackingMaterialType
  customerSkuCode: string
  productName: string | null
  materialLabel: string
  requiredQty: number
  availableStock: number
  toProcureQty: number
  expectedArrivalDate: string | null
}

interface MaterialDraft {
  availableStock: number
  toProcure: number
}

interface SkuGroup {
  exportOrderLine: number
  customerSkuCode: string
  productName: string | null
  materials: MaterialRow[]
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

export default function ExportOrderPlanningTab({ exportOrderId }: { exportOrderId: number }) {
  const [planRows, setPlanRows] = useState<SKUSupplyPlanSummary[]>([])
  const [planLoading, setPlanLoading] = useState(true)
  const [drafts, setDrafts] = useState<Record<number, { useStock: number; produce: number; procure: number }>>({})
  const [saving, setSaving] = useState(false)

  const [materialGroups, setMaterialGroups] = useState<SkuGroup[]>([])
  const [materialsLoading, setMaterialsLoading] = useState(true)
  const [materialDrafts, setMaterialDrafts] = useState<Record<string, MaterialDraft>>({})
  const [lastRefreshed, setLastRefreshed] = useState(() => dayjs())

  const loadPlanning = useCallback(() => {
    setPlanLoading(true)
    return listSkuSupplyPlans(exportOrderId)
      .then((rows) => {
        setPlanRows(rows)
        setDrafts(
          Object.fromEntries(
            rows.map((row) => [
              row.export_order_line,
              {
                useStock: row.quantity_from_stock,
                produce: row.quantity_to_produce,
                procure: row.quantity_to_procure,
              },
            ]),
          ),
        )
      })
      .finally(() => setPlanLoading(false))
  }, [exportOrderId])

  const loadMaterials = useCallback(() => {
    setMaterialsLoading(true)
    return Promise.all(
      PACKING_MATERIAL_TABS.map(({ key, label }) =>
        listPackingMaterialRequirements(exportOrderId, key).then((rows) => ({
          materialType: key,
          label,
          rows,
        })),
      ),
    )
      .then((results) => {
        const groupsByLine = new Map<number, SkuGroup>()
        const nextDrafts: Record<string, MaterialDraft> = {}
        for (const { materialType, label, rows } of results) {
          for (const row of rows as PackingMaterialRequirementSummary[]) {
            let group = groupsByLine.get(row.export_order_line)
            if (!group) {
              group = {
                exportOrderLine: row.export_order_line,
                customerSkuCode: row.customer_sku_code,
                productName: row.product_name,
                materials: [],
              }
              groupsByLine.set(row.export_order_line, group)
            }
            const rowKey = `${row.export_order_line}-${materialType}`
            group.materials.push({
              key: rowKey,
              exportOrderLine: row.export_order_line,
              materialType,
              customerSkuCode: row.customer_sku_code,
              productName: row.product_name,
              materialLabel: label,
              requiredQty: row.required_qty,
              availableStock: row.available_stock,
              toProcureQty: row.to_procure_qty,
              expectedArrivalDate: row.expected_arrival_date,
            })
            nextDrafts[rowKey] = { availableStock: row.available_stock, toProcure: row.to_procure_qty }
          }
        }
        setMaterialGroups(
          [...groupsByLine.values()].sort((a, b) => a.exportOrderLine - b.exportOrderLine),
        )
        setMaterialDrafts(nextDrafts)
      })
      .finally(() => setMaterialsLoading(false))
  }, [exportOrderId])

  useEffect(() => {
    loadPlanning()
  }, [loadPlanning])

  useEffect(() => {
    loadMaterials()
  }, [loadMaterials])

  const updateDraft = (
    exportOrderLine: number,
    patch: Partial<{ useStock: number; produce: number; procure: number }>,
  ) => {
    setDrafts((prev) => ({ ...prev, [exportOrderLine]: { ...prev[exportOrderLine], ...patch } }))
  }

  const updateMaterialDraft = (rowKey: string, patch: Partial<MaterialDraft>) => {
    setMaterialDrafts((prev) => ({ ...prev, [rowKey]: { ...prev[rowKey], ...patch } }))
  }

  const handleSavePlanning = async () => {
    setSaving(true)
    try {
      const dirtyPlanRows = planRows.filter((row) => {
        const draft = drafts[row.export_order_line]
        return (
          draft &&
          (draft.useStock !== row.quantity_from_stock ||
            draft.produce !== row.quantity_to_produce ||
            draft.procure !== row.quantity_to_procure)
        )
      })
      const allMaterialRows = materialGroups.flatMap((group) => group.materials)
      const dirtyMaterialRows = allMaterialRows.filter((row) => {
        const draft = materialDrafts[row.key]
        return (
          draft &&
          (draft.availableStock !== row.availableStock || draft.toProcure !== row.toProcureQty)
        )
      })

      await Promise.all([
        ...dirtyPlanRows.map((row) => {
          const draft = drafts[row.export_order_line]
          return updateSkuSupplyPlan(exportOrderId, row.export_order_line, {
            quantity_from_stock: draft.useStock,
            quantity_to_produce: draft.produce,
            quantity_to_procure: draft.procure,
          })
        }),
        ...dirtyMaterialRows.map((row) => {
          const draft = materialDrafts[row.key]
          // Only the field the coordinator actually touched is sent —
          // editing Available alone must not silently freeze To Procure
          // (still auto-tracking shortage) into a manual override, and
          // vice versa.
          const payload: Partial<PackingMaterialRequirementFormValues> = {}
          if (draft.availableStock !== row.availableStock) {
            payload.available_stock = draft.availableStock
          }
          if (draft.toProcure !== row.toProcureQty) {
            payload.manual_to_procure_qty = draft.toProcure
          }
          return updatePackingMaterialRequirement(
            exportOrderId,
            row.exportOrderLine,
            row.materialType,
            payload,
          )
        }),
      ])

      const savedCount = dirtyPlanRows.length + dirtyMaterialRows.length
      message.success(savedCount > 0 ? 'Planning saved.' : 'Nothing to save.')
      await Promise.all([loadPlanning(), loadMaterials()])
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : 'Could not save planning.')
    } finally {
      setSaving(false)
    }
  }

  const handleRefresh = () => {
    void loadPlanning()
    void loadMaterials()
    setLastRefreshed(dayjs())
  }

  const planTotals = {
    ordered: sum(planRows.map((r) => r.required_qty)),
    stock: sum(planRows.map((r) => r.quantity_from_stock)),
    useStock: sum(planRows.map((r) => drafts[r.export_order_line]?.useStock ?? r.quantity_from_stock)),
    produce: sum(planRows.map((r) => drafts[r.export_order_line]?.produce ?? r.quantity_to_produce)),
    procure: sum(planRows.map((r) => drafts[r.export_order_line]?.procure ?? r.quantity_to_procure)),
  }

  const materialRows: MaterialRow[] = materialGroups.flatMap((group) => group.materials)

  return (
    <SectionCard
      title="Planning"
      extra={
        <Space>
          <Button loading={saving} onClick={() => void handleSavePlanning()}>
            Save Planning
          </Button>
          <Button
            icon={<FileExcelOutlined />}
            onClick={() => message.info("Export to Excel isn't available yet.")}
          >
            Export to Excel
          </Button>
          <Button
            type="primary"
            icon={<ShoppingOutlined />}
            onClick={() => message.info("Generating Material POs isn't available yet.")}
          >
            Generate Material POs
          </Button>
        </Space>
      }
    >
      <Text strong style={{ display: 'block', marginBottom: 12 }}>
        Line Item Planning
      </Text>
      <Table<SKUSupplyPlanSummary>
        rowKey="export_order_line"
        loading={planLoading}
        dataSource={planRows}
        pagination={false}
        scroll={{ x: 'max-content' }}
        style={{ marginBottom: 32 }}
        summary={() => (
          <Table.Summary.Row>
            <Table.Summary.Cell index={0}>
              <Text strong>Total</Text>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={1}>
              <Text strong>{planTotals.ordered.toLocaleString()} pcs</Text>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={2}>
              <Text strong>{planTotals.stock.toLocaleString()} pcs</Text>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={3}>
              <Text strong>{planTotals.useStock.toLocaleString()} pcs</Text>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={4}>
              <Text strong>{planTotals.produce.toLocaleString()} pcs</Text>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={5}>
              <Text strong>{planTotals.procure.toLocaleString()} pcs</Text>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={6}>-</Table.Summary.Cell>
          </Table.Summary.Row>
        )}
        columns={[
          {
            title: 'SKU',
            key: 'sku',
            render: (_, record) => (
              <div>
                <div>{record.customer_sku_code}</div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {record.product_name || record.product_sku_code || '—'}
                </Text>
              </div>
            ),
          },
          {
            title: 'Ordered Qty',
            dataIndex: 'required_qty',
            render: (v: number) => `${v.toLocaleString()} pcs`,
          },
          {
            title: 'Stock',
            dataIndex: 'quantity_from_stock',
            render: (v: number) => `${v.toLocaleString()} pcs`,
          },
          {
            title: 'Use Stock',
            key: 'use_stock',
            render: (_, record) => (
              <InputNumber
                min={0}
                aria-label={`Use Stock — ${record.customer_sku_code}`}
                value={drafts[record.export_order_line]?.useStock ?? record.quantity_from_stock}
                onChange={(value) =>
                  updateDraft(record.export_order_line, { useStock: value ?? 0 })
                }
                style={{ width: 120 }}
              />
            ),
          },
          {
            title: 'Produce',
            key: 'produce',
            render: (_, record) => (
              <InputNumber
                min={0}
                aria-label={`Produce — ${record.customer_sku_code}`}
                value={drafts[record.export_order_line]?.produce ?? record.quantity_to_produce}
                onChange={(value) => updateDraft(record.export_order_line, { produce: value ?? 0 })}
                style={{ width: 120 }}
              />
            ),
          },
          {
            title: 'Procure',
            key: 'procure',
            render: (_, record) => (
              <InputNumber
                min={0}
                aria-label={`Procure — ${record.customer_sku_code}`}
                value={drafts[record.export_order_line]?.procure ?? record.quantity_to_procure}
                onChange={(value) => updateDraft(record.export_order_line, { procure: value ?? 0 })}
                style={{ width: 120 }}
              />
            ),
          },
          {
            title: 'ETA',
            dataIndex: 'overall_sku_expected_ready_date',
            render: (value: string | null) => value || '—',
          },
        ]}
      />

      <Text strong style={{ display: 'block', marginBottom: 12 }}>
        Packing Material Planning by SKU
      </Text>
      <Table<MaterialRow>
        rowKey="key"
        loading={materialsLoading}
        dataSource={materialRows}
        pagination={false}
        scroll={{ x: 'max-content' }}
        style={{ marginBottom: 16 }}
        columns={[
          {
            title: 'SKU',
            key: 'sku',
            onCell: (record, index) => {
              const rowsForLine = materialRows.filter(
                (r) => r.exportOrderLine === record.exportOrderLine,
              )
              const isFirst = materialRows[index ?? 0]?.key === rowsForLine[0]?.key
              return { rowSpan: isFirst ? rowsForLine.length : 0 }
            },
            render: (_, record) => (
              <div>
                <div>{record.customerSkuCode}</div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {record.productName || '—'}
                </Text>
              </div>
            ),
          },
          { title: 'Material', dataIndex: 'materialLabel' },
          {
            title: 'Actual Dimensions',
            key: 'dimensions',
            render: () => <Text type="secondary">—</Text>,
          },
          {
            title: 'Required',
            dataIndex: 'requiredQty',
            render: (v: number) => v.toLocaleString(),
          },
          {
            title: 'Available',
            key: 'available',
            render: (_, record) => (
              <InputNumber
                min={0}
                aria-label={`Available — ${record.customerSkuCode} — ${record.materialLabel}`}
                value={materialDrafts[record.key]?.availableStock ?? record.availableStock}
                onChange={(value) => updateMaterialDraft(record.key, { availableStock: value ?? 0 })}
                style={{ width: 100 }}
              />
            ),
          },
          {
            title: 'To Procure',
            key: 'to_procure',
            render: (_, record) => {
              const toProcure = materialDrafts[record.key]?.toProcure ?? record.toProcureQty
              return (
                <InputNumber
                  min={0}
                  aria-label={`To Procure — ${record.customerSkuCode} — ${record.materialLabel}`}
                  status={toProcure > 0 ? 'warning' : undefined}
                  value={toProcure}
                  onChange={(value) => updateMaterialDraft(record.key, { toProcure: value ?? 0 })}
                  style={{ width: 100 }}
                />
              )
            },
          },
          {
            title: 'Preferred Vendor',
            key: 'vendor',
            render: () => <Text type="secondary">—</Text>,
          },
          {
            title: 'ETA',
            dataIndex: 'expectedArrivalDate',
            render: (value: string | null) => value || '—',
          },
          {
            title: 'Action',
            key: 'action',
            render: (_, record) => {
              const toProcure = materialDrafts[record.key]?.toProcure ?? record.toProcureQty
              return (
                <Button
                  size="small"
                  disabled={toProcure <= 0}
                  onClick={() => message.info("Placing purchase orders isn't available yet.")}
                >
                  Place Order
                </Button>
              )
            },
          },
        ]}
      />

      <Alert
        type="info"
        showIcon
        title={
          <Flex justify="space-between" align="center" style={{ width: '100%' }}>
            <Text>
              ETAs are based on current schedules and supplier lead times. Last updated:{' '}
              {lastRefreshed.format('DD MMM YYYY, hh:mm A')}
            </Text>
            <Button size="small" icon={<ReloadOutlined />} onClick={handleRefresh}>
              Refresh Planning
            </Button>
          </Flex>
        }
      />
    </SectionCard>
  )
}
