import { useEffect, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Divider,
  Drawer,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Statistic,
  Table,
  Typography,
} from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { ApiError } from '../../shared/api/http'
import { listEmployees } from '../accounts/api'
import type { Employee } from '../accounts/types'
import { listPackingMaterialRequirements, updatePackingMaterialRequirement } from './api'
import SkuPlanningStatusTag from './SkuPlanningStatusTag'
import type {
  PackingMaterialRequirementFormValues,
  PackingMaterialRequirementSummary,
  PackingMaterialType,
} from './types'

const { Text } = Typography
const { TextArea } = Input

const STATUS_OPTIONS = [
  { value: 'NOT_STARTED', label: 'Not Started' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'READY', label: 'Ready' },
  { value: 'DELAYED', label: 'Delayed' },
]

interface EditFormValues {
  manual_required_qty: number | null
  available_stock: number
  manual_to_procure_qty: number | null
  ordered_qty: number
  expected_arrival_date: Dayjs | null
  received_qty: number | null
  accepted_qty: number | null
  responsible_person: number | null
  status: string
  remarks: string
}

function toDayjs(value: string | null): Dayjs | null {
  return value ? dayjs(value) : null
}

function toDateString(value: Dayjs | null): string | null {
  return value ? value.format('YYYY-MM-DD') : null
}

export default function ExportOrderPackingMaterialsTab({
  exportOrderId,
  materialType,
  title,
}: {
  exportOrderId: number
  materialType: PackingMaterialType
  title: string
}) {
  const [rows, setRows] = useState<PackingMaterialRequirementSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [editingRow, setEditingRow] = useState<PackingMaterialRequirementSummary | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [form] = Form.useForm<EditFormValues>()
  const isBoxLabel = materialType === 'BOX_LABEL'

  useEffect(() => {
    setLoading(true)
    listPackingMaterialRequirements(exportOrderId, materialType)
      .then(setRows)
      .finally(() => setLoading(false))
  }, [exportOrderId, materialType])

  useEffect(() => {
    listEmployees().then((response) => setEmployees(response.results))
  }, [])

  const totals = rows.reduce(
    (acc, row) => ({
      required: acc.required + row.required_qty,
      available: acc.available + row.available_stock,
      shortage: acc.shortage + row.shortage,
      short: acc.short + (row.shortage > 0 ? 1 : 0),
    }),
    { required: 0, available: 0, shortage: 0, short: 0 },
  )

  const openDrawer = (row: PackingMaterialRequirementSummary) => {
    setEditingRow(row)
    setFormError(null)
    form.setFieldsValue({
      manual_required_qty: row.manual_required_qty,
      available_stock: row.available_stock,
      manual_to_procure_qty: row.manual_to_procure_qty,
      ordered_qty: row.ordered_qty,
      expected_arrival_date: toDayjs(row.expected_arrival_date),
      received_qty: row.received_qty,
      accepted_qty: row.accepted_qty,
      responsible_person: row.responsible_person,
      status: row.status,
      remarks: row.remarks,
    })
  }

  const closeDrawer = () => {
    setEditingRow(null)
    setFormError(null)
  }

  const handleSubmit = async (values: EditFormValues) => {
    if (!editingRow) return
    setSubmitting(true)
    setFormError(null)
    try {
      const payload: Partial<PackingMaterialRequirementFormValues> = {
        ...values,
        expected_arrival_date: toDateString(values.expected_arrival_date),
        status: values.status as PackingMaterialRequirementFormValues['status'],
      }
      const updated = await updatePackingMaterialRequirement(
        exportOrderId,
        editingRow.export_order_line,
        materialType,
        payload,
      )
      setRows((prev) =>
        prev.map((row) =>
          row.export_order_line === editingRow.export_order_line ? { ...row, ...updated } : row,
        ),
      )
      closeDrawer()
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not save this requirement.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card title={title}>
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Statistic title="Total Required" value={totals.required} />
        </Col>
        <Col span={6}>
          <Statistic title="Total Available" value={totals.available} />
        </Col>
        <Col span={6}>
          <Statistic
            title="Total Shortage"
            value={totals.shortage}
            valueStyle={totals.shortage > 0 ? { color: '#cf1322' } : undefined}
          />
        </Col>
        <Col span={6}>
          <Statistic
            title="SKUs Short"
            value={totals.short}
            valueStyle={totals.short > 0 ? { color: '#cf1322' } : undefined}
          />
        </Col>
      </Row>

      <Table<PackingMaterialRequirementSummary>
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
          { title: 'Required', dataIndex: 'required_qty' },
          { title: 'Available Stock', dataIndex: 'available_stock' },
          {
            title: 'Shortage',
            dataIndex: 'shortage',
            render: (value: number) => (
              <Text strong={value > 0} type={value > 0 ? 'danger' : undefined}>
                {value}
              </Text>
            ),
          },
          {
            title: 'To Procure',
            dataIndex: 'to_procure_qty',
            render: (value: number, record) => (
              <Text strong={value > 0} type={value > 0 ? 'danger' : undefined}>
                {value}
                {record.manual_to_procure_qty !== null && (
                  <Text type="secondary" style={{ fontWeight: 'normal', fontSize: 12 }}>
                    {' '}
                    (manual)
                  </Text>
                )}
              </Text>
            ),
          },
          { title: 'Ordered', dataIndex: 'ordered_qty' },
          {
            title: 'Expected Arrival',
            dataIndex: 'expected_arrival_date',
            render: (value: string | null) => value || '—',
          },
          {
            title: 'Received',
            dataIndex: 'received_qty',
            render: (value: number | null) => value ?? '—',
          },
          {
            title: 'Accepted',
            dataIndex: 'accepted_qty',
            render: (value: number | null) => value ?? '—',
          },
          {
            title: 'Responsible',
            key: 'responsible',
            render: (_, record) => record.responsible_person_detail?.full_name ?? '—',
          },
          {
            title: 'Status',
            dataIndex: 'status',
            render: (value: PackingMaterialRequirementSummary['status']) => (
              <SkuPlanningStatusTag status={value} />
            ),
          },
        ]}
      />

      <Drawer
        title={editingRow ? `${title} — ${editingRow.customer_sku_code}` : title}
        open={editingRow !== null}
        onClose={closeDrawer}
        size={420}
        extra={
          <Button type="primary" loading={submitting} onClick={() => form.submit()}>
            Save
          </Button>
        }
      >
        {editingRow && (
          <>
            {formError && <Alert type="error" title={formError} showIcon style={{ marginBottom: 16 }} />}

            <Form<EditFormValues>
              form={form}
              layout="vertical"
              onFinish={handleSubmit}
              disabled={submitting}
            >
              {isBoxLabel ? (
                <Form.Item label="Required" name="manual_required_qty">
                  <InputNumber min={0} style={{ width: '100%' }} />
                </Form.Item>
              ) : (
                <Text strong>Required: {editingRow.required_qty.toLocaleString()}</Text>
              )}

              <Divider titlePlacement="left">Stock &amp; Orders</Divider>
              <Form.Item label="Available Stock" name="available_stock">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item
                label="To Procure"
                name="manual_to_procure_qty"
                help={`Shortage is ${editingRow.shortage.toLocaleString()} — raise this to procure extra (e.g. a packing-damage buffer).`}
              >
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item label="Ordered" name="ordered_qty">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item label="Expected Arrival" name="expected_arrival_date">
                <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
              </Form.Item>

              <Divider titlePlacement="left">Receipt</Divider>
              <Form.Item label="Received" name="received_qty">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item label="Accepted" name="accepted_qty">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>

              <Divider titlePlacement="left">Responsibility &amp; Status</Divider>
              <Form.Item label="Responsible Person" name="responsible_person">
                <Select
                  allowClear
                  options={employees.map((e) => ({ value: e.id, label: e.full_name }))}
                  showSearch
                  optionFilterProp="label"
                />
              </Form.Item>
              <Form.Item label="Status" name="status">
                <Select options={STATUS_OPTIONS} />
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
