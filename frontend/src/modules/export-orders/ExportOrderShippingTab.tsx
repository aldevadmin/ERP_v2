import { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  Button,
  DatePicker,
  Divider,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Table,
  Typography,
  message,
} from 'antd'
import { DeleteOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import SectionCard from '../../shared/components/SectionCard'
import { ApiError } from '../../shared/api/http'
import {
  createShipment,
  createShipmentLine,
  deleteShipment,
  deleteShipmentLine,
  listExportOrderLines,
  listShipmentLines,
  listShipments,
  updateShipment,
} from './api'
import type {
  ExportOrderLine,
  Shipment,
  ShipmentFormValues,
  ShipmentLine,
  ShipmentStatus,
} from './types'

const { Text } = Typography
const { TextArea } = Input

const STATUS_OPTIONS: { value: ShipmentStatus; label: string }[] = [
  { value: 'PLANNING', label: 'Planning' },
  { value: 'PACKING', label: 'Packing' },
  { value: 'READY_TO_LOAD', label: 'Ready to Load' },
  { value: 'LOADING', label: 'Loading' },
  { value: 'SHIPPED', label: 'Shipped' },
  { value: 'CANCELLED', label: 'Cancelled' },
]

function statusLabel(value: ShipmentStatus): string {
  return STATUS_OPTIONS.find((o) => o.value === value)?.label ?? value
}

interface NewShipmentFormValues {
  planned_container_type?: string
  planned_ready_date?: Dayjs
  planned_stuffing_date?: Dayjs
  remarks?: string
}

interface EditShipmentFormValues {
  status: ShipmentStatus
  planned_container_type?: string
  planned_ready_date?: Dayjs
  planned_stuffing_date?: Dayjs
  container_number?: string
  remarks?: string
}

interface AddLineFormValues {
  export_order_line: number
  planned_qty: number
}

/** Shipment-level planning (create/edit shipments, assign SKUs) — this is
 * the same functionality that used to live under a separate "Shipments"
 * tab; it moved here because Shipping is where shipment-level concerns
 * live in the redesigned IA. Freight/customs fields and document tracking
 * shown in the target design are a later phase, not built yet. */
export default function ExportOrderShippingTab({ exportOrderId }: { exportOrderId: number }) {
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [loading, setLoading] = useState(true)
  const [orderLines, setOrderLines] = useState<ExportOrderLine[]>([])

  const [newModalOpen, setNewModalOpen] = useState(false)
  const [newSubmitting, setNewSubmitting] = useState(false)
  const [newError, setNewError] = useState<string | null>(null)
  const [newForm] = Form.useForm<NewShipmentFormValues>()

  const [editingShipment, setEditingShipment] = useState<Shipment | null>(null)
  const [editSubmitting, setEditSubmitting] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [editForm] = Form.useForm<EditShipmentFormValues>()

  const [lines, setLines] = useState<ShipmentLine[]>([])
  const [linesLoading, setLinesLoading] = useState(false)
  const [addLineForm] = Form.useForm<AddLineFormValues>()
  const [addLineSubmitting, setAddLineSubmitting] = useState(false)
  const [addLineError, setAddLineError] = useState<string | null>(null)

  const loadShipments = useCallback(() => {
    setLoading(true)
    return listShipments(exportOrderId)
      .then(setShipments)
      .finally(() => setLoading(false))
  }, [exportOrderId])

  useEffect(() => {
    loadShipments()
  }, [loadShipments])

  useEffect(() => {
    listExportOrderLines(exportOrderId).then(setOrderLines)
  }, [exportOrderId])

  const openNewModal = () => {
    newForm.resetFields()
    setNewError(null)
    setNewModalOpen(true)
  }

  const closeNewModal = () => {
    setNewModalOpen(false)
    setNewError(null)
  }

  const handleCreateShipment = async (values: NewShipmentFormValues) => {
    setNewSubmitting(true)
    setNewError(null)
    try {
      const payload: ShipmentFormValues = {
        planned_container_type: values.planned_container_type || '',
        planned_ready_date: values.planned_ready_date
          ? values.planned_ready_date.format('YYYY-MM-DD')
          : null,
        planned_stuffing_date: values.planned_stuffing_date
          ? values.planned_stuffing_date.format('YYYY-MM-DD')
          : null,
        remarks: values.remarks || '',
      }
      await createShipment(exportOrderId, payload)
      message.success('Shipment created.')
      closeNewModal()
      await loadShipments()
    } catch (err) {
      setNewError(err instanceof ApiError ? err.message : 'Could not create this shipment.')
    } finally {
      setNewSubmitting(false)
    }
  }

  const loadLines = (shipmentId: number) => {
    setLinesLoading(true)
    listShipmentLines(exportOrderId, shipmentId)
      .then(setLines)
      .finally(() => setLinesLoading(false))
  }

  const openShipment = (shipment: Shipment) => {
    setEditingShipment(shipment)
    setEditError(null)
    editForm.setFieldsValue({
      status: shipment.status,
      planned_container_type: shipment.planned_container_type,
      planned_ready_date: shipment.planned_ready_date ? dayjs(shipment.planned_ready_date) : undefined,
      planned_stuffing_date: shipment.planned_stuffing_date
        ? dayjs(shipment.planned_stuffing_date)
        : undefined,
      container_number: shipment.container_number,
      remarks: shipment.remarks,
    })
    addLineForm.resetFields()
    setAddLineError(null)
    loadLines(shipment.id)
  }

  const closeShipment = () => {
    setEditingShipment(null)
    setEditError(null)
    setLines([])
  }

  const handleUpdateShipment = async (values: EditShipmentFormValues) => {
    if (!editingShipment) return
    setEditSubmitting(true)
    setEditError(null)
    try {
      const payload: Partial<ShipmentFormValues> = {
        status: values.status,
        planned_container_type: values.planned_container_type || '',
        planned_ready_date: values.planned_ready_date
          ? values.planned_ready_date.format('YYYY-MM-DD')
          : null,
        planned_stuffing_date: values.planned_stuffing_date
          ? values.planned_stuffing_date.format('YYYY-MM-DD')
          : null,
        container_number: values.container_number || '',
        remarks: values.remarks || '',
      }
      const updated = await updateShipment(exportOrderId, editingShipment.id, payload)
      setEditingShipment(updated)
      setShipments((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
      message.success('Shipment updated.')
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : 'Could not update this shipment.')
    } finally {
      setEditSubmitting(false)
    }
  }

  const handleDeleteShipment = async (shipment: Shipment) => {
    await deleteShipment(exportOrderId, shipment.id)
    message.success('Shipment deleted.')
    if (editingShipment?.id === shipment.id) closeShipment()
    await loadShipments()
  }

  const handleAddLine = async (values: AddLineFormValues) => {
    if (!editingShipment) return
    setAddLineSubmitting(true)
    setAddLineError(null)
    try {
      const created = await createShipmentLine(exportOrderId, editingShipment.id, {
        export_order_line: values.export_order_line,
        planned_qty: values.planned_qty,
      })
      setLines((prev) => [...prev, created])
      addLineForm.resetFields()
    } catch (err) {
      setAddLineError(err instanceof ApiError ? err.message : 'Could not add this line.')
    } finally {
      setAddLineSubmitting(false)
    }
  }

  const handleDeleteLine = async (line: ShipmentLine) => {
    if (!editingShipment) return
    await deleteShipmentLine(exportOrderId, editingShipment.id, line.id)
    setLines((prev) => prev.filter((l) => l.id !== line.id))
  }

  const lineOptions = orderLines.map((line) => ({
    value: line.id,
    label: `${line.customer_sku_code}${line.product_name ? ` — ${line.product_name}` : ''}`,
  }))

  return (
    <SectionCard
      title="Shipping"
      extra={
        <Button type="primary" onClick={openNewModal}>
          New Shipment
        </Button>
      }
    >
      <Table<Shipment>
        rowKey="id"
        loading={loading}
        dataSource={shipments}
        pagination={false}
        scroll={{ x: 'max-content' }}
        onRow={(record) => ({
          onClick: () => openShipment(record),
          style: { cursor: 'pointer' },
        })}
        columns={[
          { title: 'Shipment Number', dataIndex: 'shipment_number' },
          {
            title: 'Planned Container Type',
            dataIndex: 'planned_container_type',
            render: (v: string) => v || '—',
          },
          {
            title: 'Planned Ready Date',
            dataIndex: 'planned_ready_date',
            render: (v: string | null) => v || '—',
          },
          {
            title: 'Planned Stuffing Date',
            dataIndex: 'planned_stuffing_date',
            render: (v: string | null) => v || '—',
          },
          {
            title: 'Container Number',
            dataIndex: 'container_number',
            render: (v: string) => v || '—',
          },
          {
            title: 'Status',
            dataIndex: 'status',
            render: (v: ShipmentStatus) => statusLabel(v),
          },
        ]}
      />

      <Modal
        title="New Shipment"
        open={newModalOpen}
        onCancel={closeNewModal}
        onOk={() => newForm.submit()}
        confirmLoading={newSubmitting}
        okText="Create"
        destroyOnHidden
      >
        {newError && <Alert type="error" title={newError} showIcon style={{ marginBottom: 16 }} />}
        <Form<NewShipmentFormValues> form={newForm} layout="vertical" onFinish={handleCreateShipment}>
          <Form.Item label="Planned Container Type" name="planned_container_type">
            <Input placeholder="e.g. 40ft HC" />
          </Form.Item>
          <Form.Item label="Planned Ready Date" name="planned_ready_date">
            <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
          </Form.Item>
          <Form.Item label="Planned Stuffing Date" name="planned_stuffing_date">
            <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
          </Form.Item>
          <Form.Item label="Remarks" name="remarks">
            <TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title={editingShipment ? editingShipment.shipment_number : ''}
        open={editingShipment !== null}
        onClose={closeShipment}
        size={480}
        extra={
          editingShipment && (
            <Popconfirm
              title="Delete this shipment?"
              onConfirm={() => handleDeleteShipment(editingShipment)}
            >
              <Button danger>Delete</Button>
            </Popconfirm>
          )
        }
      >
        {editingShipment && (
          <>
            {editError && <Alert type="error" title={editError} showIcon style={{ marginBottom: 16 }} />}
            <Form<EditShipmentFormValues>
              form={editForm}
              layout="vertical"
              onFinish={handleUpdateShipment}
              disabled={editSubmitting}
            >
              <Form.Item label="Status" name="status">
                <Select options={STATUS_OPTIONS} />
              </Form.Item>
              <Form.Item label="Planned Container Type" name="planned_container_type">
                <Input />
              </Form.Item>
              <Form.Item label="Planned Ready Date" name="planned_ready_date">
                <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
              </Form.Item>
              <Form.Item label="Planned Stuffing Date" name="planned_stuffing_date">
                <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
              </Form.Item>
              <Form.Item label="Container Number" name="container_number">
                <Input placeholder="Not yet assigned" />
              </Form.Item>
              <Form.Item label="Remarks" name="remarks">
                <TextArea rows={2} />
              </Form.Item>
              <Button type="primary" htmlType="submit" loading={editSubmitting}>
                Save
              </Button>
            </Form>

            <Divider>Shipment Lines</Divider>

            <Table<ShipmentLine>
              rowKey="id"
              size="small"
              loading={linesLoading}
              dataSource={lines}
              pagination={false}
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
                { title: 'Planned Qty', dataIndex: 'planned_qty' },
                {
                  title: 'Planned Cartons',
                  dataIndex: 'planned_cartons',
                  render: (v: number | null) => v ?? '—',
                },
                {
                  title: '',
                  key: 'actions',
                  render: (_, record) => (
                    <Popconfirm title="Remove this line?" onConfirm={() => handleDeleteLine(record)}>
                      <Button
                        size="small"
                        type="text"
                        danger
                        aria-label="Delete line"
                        icon={<DeleteOutlined />}
                      />
                    </Popconfirm>
                  ),
                },
              ]}
              style={{ marginBottom: 16 }}
            />

            {addLineError && (
              <Alert type="error" title={addLineError} showIcon style={{ marginBottom: 16 }} />
            )}
            <Form<AddLineFormValues>
              form={addLineForm}
              layout="inline"
              onFinish={handleAddLine}
              disabled={addLineSubmitting}
              style={{ rowGap: 8 }}
            >
              <Form.Item
                name="export_order_line"
                rules={[{ required: true, message: 'Select a SKU.' }]}
              >
                <Select
                  placeholder="SKU"
                  aria-label="SKU"
                  options={lineOptions}
                  showSearch
                  optionFilterProp="label"
                  style={{ width: 220 }}
                />
              </Form.Item>
              <Form.Item name="planned_qty" rules={[{ required: true, message: 'Enter a quantity.' }]}>
                <InputNumber min={1} placeholder="Qty" aria-label="Qty" style={{ width: 110 }} />
              </Form.Item>
              <Form.Item>
                <Button type="primary" htmlType="submit" loading={addLineSubmitting}>
                  Add Line
                </Button>
              </Form.Item>
            </Form>
          </>
        )}
      </Drawer>
    </SectionCard>
  )
}
