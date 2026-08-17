import { useEffect, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Checkbox,
  DatePicker,
  Divider,
  Drawer,
  Form,
  Input,
  InputNumber,
  Select,
  Table,
  Typography,
} from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { ApiError } from '../../shared/api/http'
import { listEmployees, listTeams } from '../accounts/api'
import type { Employee, Team } from '../accounts/types'
import { listSkuSupplyPlans, updateSkuSupplyPlan } from './api'
import SkuPlanningStatusTag from './SkuPlanningStatusTag'
import SkuRiskTag from './SkuRiskTag'
import type { SKUSupplyPlanFormValues, SKUSupplyPlanSummary } from './types'

const { Text } = Typography
const { TextArea } = Input

const PLANNING_STATUS_OPTIONS = [
  { value: 'NOT_STARTED', label: 'Not Started' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'READY', label: 'Ready' },
  { value: 'DELAYED', label: 'Delayed' },
]

const RISK_OPTIONS = [
  { value: 'ON_TRACK', label: 'On Track' },
  { value: 'AT_RISK', label: 'At Risk' },
  { value: 'DELAYED', label: 'Delayed' },
]

interface SkuPlanningFormValues {
  quantity_from_stock: number
  quantity_to_produce: number
  quantity_to_procure: number
  is_intentionally_underplanned: boolean
  production_planned_start: Dayjs | null
  production_expected_completion: Dayjs | null
  procurement_planned_order_date: Dayjs | null
  procurement_expected_receipt: Dayjs | null
  responsible_team: number | null
  responsible_person: number | null
  risk_status: string
  planning_status: string
  remarks: string
}

function toDayjs(value: string | null): Dayjs | null {
  return value ? dayjs(value) : null
}

function toDateString(value: Dayjs | null): string | null {
  return value ? value.format('YYYY-MM-DD') : null
}

export default function ExportOrderSkuPlanningTab({ exportOrderId }: { exportOrderId: number }) {
  const [rows, setRows] = useState<SKUSupplyPlanSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [editingRow, setEditingRow] = useState<SKUSupplyPlanSummary | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [form] = Form.useForm<SkuPlanningFormValues>()
  const stock = Form.useWatch('quantity_from_stock', form) ?? 0
  const produce = Form.useWatch('quantity_to_produce', form) ?? 0
  const procure = Form.useWatch('quantity_to_procure', form) ?? 0
  const balancePreview = editingRow ? editingRow.required_qty - stock - produce - procure : 0

  useEffect(() => {
    setLoading(true)
    listSkuSupplyPlans(exportOrderId)
      .then(setRows)
      .finally(() => setLoading(false))
  }, [exportOrderId])

  useEffect(() => {
    listEmployees().then((response) => setEmployees(response.results))
    listTeams().then((response) => setTeams(response.results))
  }, [])

  const openDrawer = (row: SKUSupplyPlanSummary) => {
    setEditingRow(row)
    setFormError(null)
    form.setFieldsValue({
      quantity_from_stock: row.quantity_from_stock,
      quantity_to_produce: row.quantity_to_produce,
      quantity_to_procure: row.quantity_to_procure,
      is_intentionally_underplanned: row.is_intentionally_underplanned,
      production_planned_start: toDayjs(row.production_planned_start),
      production_expected_completion: toDayjs(row.production_expected_completion),
      procurement_planned_order_date: toDayjs(row.procurement_planned_order_date),
      procurement_expected_receipt: toDayjs(row.procurement_expected_receipt),
      responsible_team: row.responsible_team,
      responsible_person: row.responsible_person,
      risk_status: row.risk_status,
      planning_status: row.planning_status,
      remarks: row.remarks,
    })
  }

  const closeDrawer = () => {
    setEditingRow(null)
    setFormError(null)
  }

  const handleSubmit = async (values: SkuPlanningFormValues) => {
    if (!editingRow) return
    setSubmitting(true)
    setFormError(null)
    try {
      const payload: Partial<SKUSupplyPlanFormValues> = {
        ...values,
        production_planned_start: toDateString(values.production_planned_start),
        production_expected_completion: toDateString(values.production_expected_completion),
        procurement_planned_order_date: toDateString(values.procurement_planned_order_date),
        procurement_expected_receipt: toDateString(values.procurement_expected_receipt),
        risk_status: values.risk_status as SKUSupplyPlanFormValues['risk_status'],
        planning_status: values.planning_status as SKUSupplyPlanFormValues['planning_status'],
      }
      const updated = await updateSkuSupplyPlan(exportOrderId, editingRow.export_order_line, payload)
      setRows((prev) =>
        prev.map((row) =>
          row.export_order_line === editingRow.export_order_line ? { ...row, ...updated } : row,
        ),
      )
      closeDrawer()
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not save this SKU plan.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card title="SKU Planning">
      <Table<SKUSupplyPlanSummary>
        rowKey="export_order_line"
        loading={loading}
        dataSource={rows}
        pagination={false}
        scroll={{ x: 'max-content' }}
        onRow={(record) => ({
          onClick: () => openDrawer(record),
          style: { cursor: 'pointer' },
        })}
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
          { title: 'Order Qty', dataIndex: 'required_qty' },
          { title: 'Production Accepted', dataIndex: 'accepted_from_production' },
          { title: 'Procurement Accepted', dataIndex: 'accepted_from_procurement' },
          { title: 'Stock', dataIndex: 'quantity_from_stock' },
          { title: 'Need to Produce', dataIndex: 'quantity_to_produce' },
          { title: 'Need to Procure', dataIndex: 'quantity_to_procure' },
          { title: 'Plan Balance', dataIndex: 'planning_balance' },
          {
            title: 'Expected Ready',
            dataIndex: 'overall_sku_expected_ready_date',
            render: (value: string | null) => value || '—',
          },
          {
            title: 'Status',
            dataIndex: 'planning_status',
            render: (value: SKUSupplyPlanSummary['planning_status']) => (
              <SkuPlanningStatusTag status={value} />
            ),
          },
          {
            title: 'Risk',
            dataIndex: 'risk_status',
            render: (value: SKUSupplyPlanSummary['risk_status']) => <SkuRiskTag risk={value} />,
          },
          {
            title: 'Responsible',
            key: 'responsible',
            render: (_, record) =>
              record.responsible_person_detail?.full_name ??
              record.responsible_team_detail?.name ??
              '—',
          },
        ]}
      />

      <Drawer
        title={editingRow ? `Plan — ${editingRow.customer_sku_code}` : 'SKU Planning'}
        open={editingRow !== null}
        onClose={closeDrawer}
        size={480}
        extra={
          <Button type="primary" loading={submitting} onClick={() => form.submit()}>
            Save
          </Button>
        }
      >
        {editingRow && (
          <>
            {formError && <Alert type="error" title={formError} showIcon style={{ marginBottom: 16 }} />}
            <Text strong>Required Quantity: {editingRow.required_qty.toLocaleString()}</Text>

            <Form<SkuPlanningFormValues>
              form={form}
              layout="vertical"
              onFinish={handleSubmit}
              disabled={submitting}
              style={{ marginTop: 16 }}
            >
              <Divider titlePlacement="left">Quantities</Divider>
              <Form.Item label="Stock" name="quantity_from_stock">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item label="Need to Produce" name="quantity_to_produce">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item label="Need to Procure" name="quantity_to_procure">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
              <Text type={balancePreview === 0 ? 'success' : 'warning'}>
                Balance: {balancePreview.toLocaleString()}
                {balancePreview === 0
                  ? ' — fully planned'
                  : balancePreview > 0
                    ? ' — short of the requirement'
                    : ' — over-planned'}
              </Text>
              {balancePreview > 0 && (
                <Form.Item
                  name="is_intentionally_underplanned"
                  valuePropName="checked"
                  style={{ marginTop: 12 }}
                >
                  <Checkbox>Planned short — reason required</Checkbox>
                </Form.Item>
              )}

              <Divider titlePlacement="left">Production</Divider>
              <Form.Item label="Planned Start Date" name="production_planned_start">
                <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
              </Form.Item>
              <Form.Item label="Expected Completion Date" name="production_expected_completion">
                <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
              </Form.Item>

              <Divider titlePlacement="left">Procurement</Divider>
              <Form.Item label="Planned Order Date" name="procurement_planned_order_date">
                <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
              </Form.Item>
              <Form.Item label="Expected Receipt Date" name="procurement_expected_receipt">
                <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
              </Form.Item>
              <Text type="secondary">
                Expected Ready: {editingRow.overall_sku_expected_ready_date || '—'}
              </Text>

              <Divider titlePlacement="left">Responsibility</Divider>
              <Form.Item label="Responsible Person" name="responsible_person">
                <Select
                  allowClear
                  options={employees.map((e) => ({ value: e.id, label: e.full_name }))}
                  showSearch
                  optionFilterProp="label"
                />
              </Form.Item>
              <Form.Item label="Responsible Team" name="responsible_team">
                <Select
                  allowClear
                  options={teams.map((t) => ({ value: t.id, label: t.name }))}
                  showSearch
                  optionFilterProp="label"
                />
              </Form.Item>

              <Divider titlePlacement="left">Status</Divider>
              <Form.Item label="Status" name="planning_status">
                <Select options={PLANNING_STATUS_OPTIONS} />
              </Form.Item>
              <Form.Item label="Risk" name="risk_status">
                <Select options={RISK_OPTIONS} />
              </Form.Item>

              <Form.Item label="Remarks" name="remarks">
                <TextArea rows={3} />
              </Form.Item>
            </Form>
          </>
        )}
      </Drawer>
    </Card>
  )
}
