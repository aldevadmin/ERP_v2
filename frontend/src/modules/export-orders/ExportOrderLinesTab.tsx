import { useEffect, useRef, useState } from 'react'
import type { ComponentRef } from 'react'
import {
  AutoComplete,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Popover,
  Select,
  Table,
  Typography,
} from 'antd'
import type { FormInstance } from 'antd'
import { DeleteOutlined, EditOutlined, InfoCircleOutlined } from '@ant-design/icons'
import { Link } from 'react-router'
import { ApiError } from '../../shared/api/http'
import { listCustomerProductMappings } from '../customer-mappings/api'
import type { CustomerProductMapping } from '../customer-mappings/types'
import { listItems } from '../items/api'
import type { Item } from '../items/types'
import {
  createExportOrderLine,
  deleteExportOrderLine,
  listExportOrderLines,
  listPackingMaterialRequirements,
  updateExportOrderLine,
} from './api'
import { EXPORT_ORDER_LINE_UNITS } from './types'
import type {
  ExportOrderLine,
  ExportOrderLineFormValues,
  PackingMaterialRequirementSummary,
  PackingMaterialType,
} from './types'

const { Text } = Typography

const UNIT_LABELS: Record<string, string> = Object.fromEntries(
  EXPORT_ORDER_LINE_UNITS.map((u) => [u.value, u.label]),
)

function PackingStatusPopover({
  value,
  requirement,
}: {
  value: number | null
  requirement: PackingMaterialRequirementSummary | undefined
}) {
  if (!requirement) return <>{value ?? '—'}</>
  return (
    <span>
      {value ?? '—'}{' '}
      <Popover
        title="Packing material status"
        content={
          <div style={{ minWidth: 180 }}>
            <div>Available Stock: {requirement.available_stock}</div>
            <div>
              Shortage:{' '}
              <Text type={requirement.shortage > 0 ? 'danger' : undefined}>
                {requirement.shortage}
              </Text>
            </div>
            <div>Ordered: {requirement.ordered_qty}</div>
            <div>Expected Arrival: {requirement.expected_arrival_date || '—'}</div>
          </div>
        }
      >
        <InfoCircleOutlined style={{ color: '#8c8c8c', cursor: 'pointer' }} />
      </Popover>
    </span>
  )
}

export default function ExportOrderLinesTab({
  exportOrderId,
  customerId,
}: {
  exportOrderId: number
  customerId: number
}) {
  const [lines, setLines] = useState<ExportOrderLine[]>([])
  const [loading, setLoading] = useState(true)
  const [skuOptions, setSkuOptions] = useState<CustomerProductMapping[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [packingByMaterial, setPackingByMaterial] = useState<
    Record<PackingMaterialType, Map<number, PackingMaterialRequirementSummary>>
  >({ CARTON: new Map(), POUCH: new Map(), RETAIL_STICKER: new Map(), BOX_LABEL: new Map() })
  const [entrySubmitting, setEntrySubmitting] = useState(false)
  const [entryError, setEntryError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editSubmitting, setEditSubmitting] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  const [entryForm] = Form.useForm<ExportOrderLineFormValues>()
  const [editForm] = Form.useForm<ExportOrderLineFormValues>()
  const skuInputRef = useRef<ComponentRef<typeof AutoComplete>>(null)

  useEffect(() => {
    setLoading(true)
    listExportOrderLines(exportOrderId)
      .then(setLines)
      .finally(() => setLoading(false))
  }, [exportOrderId])

  useEffect(() => {
    listCustomerProductMappings({ customer: customerId }).then((response) =>
      setSkuOptions(response.results.filter((m) => m.current_version?.status === 'PUBLISHED')),
    )
    listItems({ isActive: true }).then((response) =>
      setItems(response.results.filter((i) => i.item_class === 'WIP' || i.item_class === 'FINISHED_GOOD')),
    )
  }, [customerId])

  useEffect(() => {
    const materialTypes: PackingMaterialType[] = ['CARTON', 'POUCH', 'RETAIL_STICKER']
    Promise.all(
      materialTypes.map((materialType) =>
        listPackingMaterialRequirements(exportOrderId, materialType).then(
          (rows) => [materialType, rows] as const,
        ),
      ),
    ).then((results) => {
      setPackingByMaterial((prev) => {
        const next = { ...prev }
        for (const [materialType, rows] of results) {
          next[materialType] = new Map(rows.map((row) => [row.export_order_line, row]))
        }
        return next
      })
    })
  }, [exportOrderId])

  const skuAutocompleteOptions = skuOptions.map((mapping) => ({
    value: mapping.customer_sku,
    label: `${mapping.customer_sku} — ${mapping.current_version!.customer_description || mapping.item_name}`,
  }))
  const itemOptions = items.map((i) => ({ value: i.id, label: `${i.name} (${i.code})` }))

  const applySkuMatch = (value: string, form: FormInstance<ExportOrderLineFormValues>) => {
    const match = skuOptions.find((mapping) => mapping.customer_sku.toLowerCase() === value.toLowerCase())
    if (match) {
      form.setFieldsValue({
        customer_description: match.current_version!.customer_description,
        item: match.item,
      })
    }
  }

  const handleAddLine = async (values: ExportOrderLineFormValues) => {
    setEntrySubmitting(true)
    setEntryError(null)
    try {
      const created = await createExportOrderLine(exportOrderId, {
        ...values,
        customer_description: values.customer_description || '',
        item: values.item ?? null,
      })
      setLines((prev) => [...prev, created])
      entryForm.resetFields()
      skuInputRef.current?.focus()
    } catch (err) {
      setEntryError(err instanceof ApiError ? err.message : 'Could not add this line.')
    } finally {
      setEntrySubmitting(false)
    }
  }

  const startEdit = (line: ExportOrderLine) => {
    setEditingId(line.id)
    setEditError(null)
    editForm.setFieldsValue({
      customer_sku_code: line.customer_sku_code,
      customer_description: line.customer_description,
      item: line.item,
      original_customer_quantity: line.original_customer_quantity,
      original_customer_unit: line.original_customer_unit,
    })
  }

  const handleSaveEdit = async (values: ExportOrderLineFormValues) => {
    if (editingId === null) return
    setEditSubmitting(true)
    setEditError(null)
    try {
      const updated = await updateExportOrderLine(exportOrderId, editingId, values)
      setLines((prev) => prev.map((line) => (line.id === editingId ? updated : line)))
      setEditingId(null)
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : 'Could not save this line.')
    } finally {
      setEditSubmitting(false)
    }
  }

  const handleDelete = async (id: number) => {
    await deleteExportOrderLine(exportOrderId, id)
    setLines((prev) => prev.filter((line) => line.id !== id))
  }

  const columns = [
    { title: 'Line #', dataIndex: 'line_number', width: 70 },
    {
      title: 'Customer SKU',
      dataIndex: 'customer_sku_code',
      render: (value: string, record: ExportOrderLine) =>
        editingId === record.id ? (
          <Form.Item name="customer_sku_code" style={{ margin: 0 }} rules={[{ required: true }]}>
            <AutoComplete
              options={skuAutocompleteOptions}
              onChange={(v) => applySkuMatch(v, editForm)}
              filterOption={(input, option) =>
                ((option?.value as string | undefined) ?? '').toLowerCase().includes(input.toLowerCase())
              }
            />
          </Form.Item>
        ) : (
          value
        ),
    },
    {
      title: 'Customer Description',
      dataIndex: 'customer_description',
      render: (value: string, record: ExportOrderLine) =>
        editingId === record.id ? (
          <Form.Item name="customer_description" style={{ margin: 0 }}>
            <Input />
          </Form.Item>
        ) : (
          value || '—'
        ),
    },
    {
      title: 'Internal SKU',
      dataIndex: 'item_code',
      render: (value: string | null, record: ExportOrderLine) =>
        editingId === record.id ? (
          <Form.Item name="item" style={{ margin: 0 }}>
            <Select
              allowClear
              options={itemOptions}
              showSearch
              optionFilterProp="label"
              style={{ minWidth: 160 }}
            />
          </Form.Item>
        ) : (
          value || '—'
        ),
    },
    { title: 'Internal Description', dataIndex: 'item_name', render: (v: string | null) => v || '—' },
    {
      title: 'Qty',
      dataIndex: 'original_customer_quantity',
      render: (value: number, record: ExportOrderLine) =>
        editingId === record.id ? (
          <Form.Item name="original_customer_quantity" style={{ margin: 0 }} rules={[{ required: true }]}>
            <InputNumber min={1} style={{ width: 90 }} />
          </Form.Item>
        ) : (
          value
        ),
    },
    {
      title: 'Unit',
      dataIndex: 'original_customer_unit',
      render: (value: string, record: ExportOrderLine) =>
        editingId === record.id ? (
          <Form.Item name="original_customer_unit" style={{ margin: 0 }} rules={[{ required: true }]}>
            <Select options={EXPORT_ORDER_LINE_UNITS} style={{ width: 110 }} />
          </Form.Item>
        ) : (
          UNIT_LABELS[value] ?? value
        ),
    },
    { title: 'Pieces/Pouch', dataIndex: 'pieces_per_pouch', render: (v: number | null) => v ?? '—' },
    { title: 'Pouches/Carton', dataIndex: 'pouches_per_carton', render: (v: number | null) => v ?? '—' },
    { title: 'Pieces/Carton', dataIndex: 'pieces_per_carton', render: (v: number | null) => v ?? '—' },
    { title: 'Converted Piece Requirement', dataIndex: 'required_pieces' },
    {
      title: 'Required Pouches',
      dataIndex: 'required_pouches',
      render: (v: number | null, record: ExportOrderLine) => (
        <PackingStatusPopover value={v} requirement={packingByMaterial.POUCH.get(record.id)} />
      ),
    },
    {
      title: 'Required Stickers',
      dataIndex: 'required_stickers',
      render: (v: number, record: ExportOrderLine) => (
        <PackingStatusPopover value={v} requirement={packingByMaterial.RETAIL_STICKER.get(record.id)} />
      ),
    },
    {
      title: 'Required Cartons',
      dataIndex: 'required_cartons',
      render: (v: number | null, record: ExportOrderLine) => (
        <PackingStatusPopover value={v} requirement={packingByMaterial.CARTON.get(record.id)} />
      ),
    },
    {
      title: '',
      key: 'actions',
      fixed: 'right' as const,
      width: 96,
      render: (_: unknown, record: ExportOrderLine) =>
        editingId === record.id ? (
          <>
            <Button
              size="small"
              type="link"
              loading={editSubmitting}
              onClick={() => editForm.submit()}
            >
              Save
            </Button>
            <Button size="small" type="link" onClick={() => setEditingId(null)}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button
              size="small"
              type="text"
              aria-label="Edit line"
              icon={<EditOutlined />}
              onClick={() => startEdit(record)}
            />
            <Popconfirm title="Delete this line?" onConfirm={() => handleDelete(record.id)}>
              <Button size="small" type="text" danger aria-label="Delete line" icon={<DeleteOutlined />} />
            </Popconfirm>
          </>
        ),
    },
  ]

  return (
    <Card title="Order Lines">
      {editError && (
        <div style={{ color: '#ff4d4f', marginBottom: 8 }}>{editError}</div>
      )}
      <Form<ExportOrderLineFormValues> form={editForm} component={false} onFinish={handleSaveEdit}>
        <Table<ExportOrderLine>
          rowKey="id"
          loading={loading}
          dataSource={lines}
          pagination={false}
          scroll={{ x: 'max-content' }}
          columns={columns}
          style={{ marginBottom: 16 }}
        />
      </Form>

      <Form<ExportOrderLineFormValues>
        form={entryForm}
        layout="inline"
        onFinish={handleAddLine}
        disabled={entrySubmitting}
        initialValues={{ original_customer_unit: 'PIECE' }}
        style={{ rowGap: 8 }}
      >
        <Form.Item
          name="customer_sku_code"
          rules={[{ required: true, message: 'Enter the customer SKU.' }]}
        >
          <AutoComplete
            ref={skuInputRef}
            options={skuAutocompleteOptions}
            onChange={(v) => applySkuMatch(v, entryForm)}
            placeholder="Customer SKU"
            aria-label="Customer SKU"
            style={{ width: 160 }}
            filterOption={(input, option) =>
              ((option?.value as string | undefined) ?? '').toLowerCase().includes(input.toLowerCase())
            }
          />
        </Form.Item>
        <Form.Item name="customer_description">
          <Input placeholder="Customer Description" style={{ width: 180 }} />
        </Form.Item>
        <Form.Item name="item">
          <Select
            allowClear
            placeholder="Internal SKU"
            aria-label="Internal SKU"
            options={itemOptions}
            showSearch
            optionFilterProp="label"
            style={{ width: 160 }}
          />
        </Form.Item>
        <Form.Item name="original_customer_quantity" rules={[{ required: true, message: 'Enter a quantity.' }]}>
          <InputNumber min={1} placeholder="Quantity" style={{ width: 100 }} />
        </Form.Item>
        <Form.Item name="original_customer_unit" rules={[{ required: true }]}>
          <Select aria-label="Unit" options={EXPORT_ORDER_LINE_UNITS} style={{ width: 110 }} />
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" loading={entrySubmitting}>
            Add Line
          </Button>
        </Form.Item>
      </Form>
      {entryError && (
        <div style={{ color: '#ff4d4f', marginTop: 8 }}>
          {entryError}
          {entryError.includes('No published Customer Product Mapping') && (
            <>
              {' '}
              <Link to="/customer-product-mappings/new">Create one</Link>
            </>
          )}
        </div>
      )}
    </Card>
  )
}
