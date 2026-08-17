import { useEffect, useState, type ReactNode } from 'react'
import { Alert, Button, Empty, Flex, Form, Input, Modal, Table, Tag, Typography, message } from 'antd'
import { CheckOutlined, PlusOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { ApiError } from '../../shared/api/http'
import UploadPoVersionModal from './UploadPoVersionModal'
import { createExportOrderNote, listExportOrderNotes } from './api'
import type { ExportOrder, ExportOrderNote, PoVersion, StageHistoryEntry } from './types'

const { Title, Text } = Typography
const { TextArea } = Input

const INCOTERM_LABELS: Record<string, string> = {
  EXW: 'EXW — Ex Works',
  FCA: 'FCA — Free Carrier',
  CPT: 'CPT — Carriage Paid To',
  CIP: 'CIP — Carriage and Insurance Paid To',
  DAP: 'DAP — Delivered At Place',
  DPU: 'DPU — Delivered At Place Unloaded',
  DDP: 'DDP — Delivered Duty Paid',
  FAS: 'FAS — Free Alongside Ship',
  FOB: 'FOB — Free On Board',
  CFR: 'CFR — Cost and Freight',
  CIF: 'CIF — Cost, Insurance and Freight',
}

function formatAddress(address: ExportOrder['bill_to_detail']): string {
  if (!address) return '—'
  return [address.line1, address.line2, address.line3, address.state, address.country]
    .filter(Boolean)
    .join(', ')
}

function formatDate(value: string | null): string | null {
  return value ? dayjs(value).format('DD MMM YYYY') : null
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Flex justify="space-between" style={{ padding: '6px 0' }}>
      <Text type="secondary">{label}</Text>
      <Text strong>{value}</Text>
    </Flex>
  )
}

function OrderProgress({ history }: { history: StageHistoryEntry[] }) {
  return (
    <Flex align="flex-start">
      {history.map((entry, index) => {
        const isFirst = index === 0
        const lineFilled = entry.state !== 'PENDING'
        const subtext =
          entry.state === 'COMPLETED'
            ? formatDate(entry.completed_at)
              ? `Completed ${formatDate(entry.completed_at)}`
              : 'Completed'
            : entry.state === 'IN_PROGRESS'
              ? formatDate(entry.entered_at)
                ? `Since ${formatDate(entry.entered_at)}`
                : 'In Progress'
              : 'Pending'

        return (
          <Flex key={entry.status} align="center" style={{ flex: 1 }}>
            {!isFirst && (
              <div
                style={{
                  flex: 1,
                  height: 2,
                  background: lineFilled ? '#16a34a' : '#e5e7eb',
                  marginTop: -28,
                }}
              />
            )}
            <Flex vertical align="center" style={{ minWidth: 96 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background:
                    entry.state === 'COMPLETED'
                      ? '#16a34a'
                      : entry.state === 'IN_PROGRESS'
                        ? '#fff'
                        : '#fff',
                  border:
                    entry.state === 'PENDING'
                      ? '2px solid #e5e7eb'
                      : entry.state === 'IN_PROGRESS'
                        ? '2px solid #155eef'
                        : 'none',
                  boxShadow: entry.state === 'IN_PROGRESS' ? '0 0 0 4px #155eef22' : undefined,
                }}
              >
                {entry.state === 'COMPLETED' && <CheckOutlined style={{ color: '#fff' }} />}
                {entry.state === 'IN_PROGRESS' && (
                  <div
                    style={{ width: 10, height: 10, borderRadius: '50%', background: '#155eef' }}
                  />
                )}
              </div>
              <Text
                strong={entry.state === 'IN_PROGRESS'}
                style={{ marginTop: 8, color: entry.state === 'IN_PROGRESS' ? '#155eef' : undefined }}
              >
                {entry.label}
              </Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {subtext}
              </Text>
            </Flex>
          </Flex>
        )
      })}
    </Flex>
  )
}

export default function ExportOrderOverviewTab({
  order,
  onOrderUpdate,
}: {
  order: ExportOrder
  onOrderUpdate: (order: ExportOrder) => void
}) {
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [notes, setNotes] = useState<ExportOrderNote[]>([])
  const [notesLoading, setNotesLoading] = useState(true)
  const [noteModalOpen, setNoteModalOpen] = useState(false)
  const [noteSubmitting, setNoteSubmitting] = useState(false)
  const [noteError, setNoteError] = useState<string | null>(null)
  const [noteForm] = Form.useForm<{ text: string }>()

  useEffect(() => {
    setNotesLoading(true)
    listExportOrderNotes(order.id)
      .then(setNotes)
      .finally(() => setNotesLoading(false))
  }, [order.id])

  const handleAddNote = async (values: { text: string }) => {
    setNoteSubmitting(true)
    setNoteError(null)
    try {
      const created = await createExportOrderNote(order.id, values.text)
      setNotes((prev) => [created, ...prev])
      message.success('Note added.')
      setNoteModalOpen(false)
      noteForm.resetFields()
    } catch (err) {
      setNoteError(err instanceof ApiError ? err.message : 'Could not save this note.')
    } finally {
      setNoteSubmitting(false)
    }
  }

  return (
    <div>
      <Flex gap={32} wrap="wrap" style={{ marginBottom: 24 }}>
        <div style={{ flex: '1 1 320px' }}>
          <Title level={5}>Order Details</Title>
          <Field label="Order No." value={order.order_number} />
          <Field label="Customer" value={order.customer_name} />
          <Field label="PO No." value={order.customer_po_number} />
          <Field label="Order Date" value={order.customer_po_date} />
          <Field
            label="CRD"
            value={
              <Text strong style={{ color: '#d97706' }}>
                {order.planned_container_ready_date ?? '—'}
              </Text>
            }
          />
          <Field label="Container" value={order.container_type ?? '—'} />
          <Field label="Incoterm" value={order.incoterm ? INCOTERM_LABELS[order.incoterm] : '—'} />
          <Field label="Origin Country" value={order.country || '—'} />
          <Field label="Destination Port" value={order.destination_port || '—'} />
          <Field label="Currency" value={order.currency || '—'} />
        </div>
        <div style={{ flex: '1 1 320px' }}>
          <Title level={5}>Other Details</Title>
          <Field label="Export Coordinator" value={order.export_coordinator_detail?.full_name ?? '—'} />
          <Field label="Requested Shipment Date" value={order.requested_shipment_date || '—'} />
          <Field label="Payment Terms" value={order.payment_terms || '—'} />
          <Field label="Bill To" value={formatAddress(order.bill_to_detail)} />
          <Field label="Ship To" value={formatAddress(order.ship_to_detail)} />
          <Field label="Internal Remarks" value={order.internal_remarks || '—'} />
          <Field label="Customer-Visible Remarks" value={order.customer_remarks || '—'} />
        </div>
      </Flex>

      <Title level={5}>Order Progress</Title>
      <div style={{ marginBottom: 24, paddingTop: 8 }}>
        <OrderProgress history={order.stage_history} />
      </div>

      <Flex justify="space-between" align="center" style={{ marginBottom: 12 }}>
        <Title level={5} style={{ margin: 0 }}>
          PO Documents
        </Title>
        <Button onClick={() => setUploadModalOpen(true)}>Upload New Revision</Button>
      </Flex>
      <Table<PoVersion>
        rowKey="id"
        dataSource={order.po_versions}
        pagination={false}
        style={{ marginBottom: 24 }}
        columns={[
          { title: 'Version', dataIndex: 'version_number' },
          {
            title: 'File',
            dataIndex: 'document',
            render: (value: string) =>
              value ? (
                <a href={value} target="_blank" rel="noreferrer">
                  Download
                </a>
              ) : (
                '—'
              ),
          },
          { title: 'Remarks', dataIndex: 'remarks' },
          { title: 'Uploaded By', dataIndex: 'uploaded_by' },
          { title: 'Uploaded At', dataIndex: 'created_at' },
          {
            title: 'Current',
            dataIndex: 'is_current',
            render: (isCurrent: boolean) =>
              isCurrent ? <Tag color="success">Current</Tag> : null,
          },
        ]}
      />

      <Flex justify="space-between" align="center" style={{ marginBottom: 12 }}>
        <Title level={5} style={{ margin: 0 }}>
          Notes / Next Steps
        </Title>
        <Button
          icon={<PlusOutlined />}
          onClick={() => {
            setNoteError(null)
            noteForm.resetFields()
            setNoteModalOpen(true)
          }}
        >
          Add Note
        </Button>
      </Flex>
      {notesLoading ? null : notes.length === 0 ? (
        <Empty description="No notes yet." style={{ padding: 24 }} />
      ) : (
        <ul style={{ paddingLeft: 20, margin: 0 }}>
          {notes.map((note) => (
            <li key={note.id} style={{ marginBottom: 8 }}>
              <Text>{note.text}</Text>{' '}
              <Text type="secondary" style={{ fontSize: 12 }}>
                — {note.author ?? 'Unknown'}, {formatDate(note.created_at)}
              </Text>
            </li>
          ))}
        </ul>
      )}

      <UploadPoVersionModal
        open={uploadModalOpen}
        exportOrderId={order.id}
        onClose={() => setUploadModalOpen(false)}
        onUploaded={(updated) => {
          onOrderUpdate(updated)
          setUploadModalOpen(false)
        }}
      />

      <Modal
        title="Add Note"
        open={noteModalOpen}
        onCancel={() => setNoteModalOpen(false)}
        onOk={() => noteForm.submit()}
        confirmLoading={noteSubmitting}
        okText="Save"
        destroyOnHidden
      >
        {noteError && <Alert type="error" title={noteError} showIcon style={{ marginBottom: 16 }} />}
        <Form form={noteForm} layout="vertical" onFinish={handleAddNote}>
          <Form.Item
            label="Note"
            name="text"
            rules={[{ required: true, message: 'Enter a note.' }]}
          >
            <TextArea rows={3} autoFocus />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
