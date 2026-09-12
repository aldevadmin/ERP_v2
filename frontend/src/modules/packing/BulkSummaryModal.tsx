import { useEffect, useState } from 'react'
import { Alert, Button, InputNumber, Modal, Table, Tag, Typography, message } from 'antd'
import { ApiError } from '../../shared/api/http'
import { listBulkSummaryRows, saveBulkSummaries } from './api'
import type { BulkSummaryRow, BulkSummarySaveRow, PackingJob } from './types'

const { Text } = Typography

interface EditableRow extends BulkSummaryRow {
  premium_qty: number | null
  standard_qty: number | null
  reject_qty: number | null
  packed_qty: number | null
}

export default function BulkSummaryModal({
  open,
  job,
  onClose,
  onSaved,
}: {
  open: boolean
  job: PackingJob | null
  onClose: () => void
  onSaved: () => void
}) {
  const [rows, setRows] = useState<EditableRow[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open && job) {
      setError(null)
      setLoading(true)
      listBulkSummaryRows(job.id)
        .then((data) =>
          setRows(
            data.map((row) => ({
              ...row,
              premium_qty: null,
              standard_qty: null,
              reject_qty: null,
              packed_qty: null,
            })),
          ),
        )
        .finally(() => setLoading(false))
    }
  }, [open, job])

  if (!job) return null

  const updateRow = (allocation: number, patch: Partial<EditableRow>) => {
    setRows(rows.map((r) => (r.allocation === allocation ? { ...r, ...patch } : r)))
  }

  const handleSave = async () => {
    const saveRows: BulkSummarySaveRow[] = rows
      .filter((r) => (r.premium_qty ?? 0) + (r.standard_qty ?? 0) + (r.reject_qty ?? 0) + (r.packed_qty ?? 0) > 0)
      .map((r) => ({
        allocation: r.allocation,
        premium_qty: r.premium_qty ?? 0,
        standard_qty: r.standard_qty ?? 0,
        reject_qty: r.reject_qty ?? 0,
        loose_pieces_packed: r.packed_qty ?? 0,
      }))
    if (saveRows.length === 0) {
      setError('Enter output for at least one Work Centre.')
      return
    }
    setError(null)
    setSaving(true)
    try {
      await saveBulkSummaries(job.id, saveRows)
      message.success(`Saved ${saveRows.length} summary record${saveRows.length === 1 ? '' : 's'}.`)
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save these summaries.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={`${job.job_number} — End of Shift / Job Summary`}
      open={open}
      onCancel={onClose}
      footer={[
        <Button key="cancel" onClick={onClose}>
          Cancel
        </Button>,
        <Button key="save" type="primary" loading={saving} disabled={rows.length === 0} onClick={() => void handleSave()}>
          Save All Summaries
        </Button>,
      ]}
      destroyOnHidden
      width={760}
    >
      {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}
      {!loading && rows.length === 0 && (
        <Text type="secondary">No Work Centres have started work on this Job yet.</Text>
      )}
      {rows.length > 0 && (
        <Table<EditableRow>
          rowKey="allocation"
          loading={loading}
          dataSource={rows}
          pagination={false}
          size="small"
          columns={[
            { title: 'Work Centre', dataIndex: 'work_centre_code', width: 100 },
            { title: 'Operators', dataIndex: 'operators', render: (v: string) => v || '—' },
            {
              title: 'Assigned',
              dataIndex: 'assigned_qty',
              width: 90,
              render: (v: number) => v.toLocaleString(),
            },
            {
              title: 'Premium',
              key: 'premium_qty',
              width: 100,
              render: (_, record) => (
                <InputNumber
                  size="small"
                  min={0}
                  style={{ width: '100%' }}
                  value={record.premium_qty}
                  onChange={(v) => updateRow(record.allocation, { premium_qty: v })}
                />
              ),
            },
            {
              title: 'Standard',
              key: 'standard_qty',
              width: 100,
              render: (_, record) => (
                <InputNumber
                  size="small"
                  min={0}
                  style={{ width: '100%' }}
                  value={record.standard_qty}
                  onChange={(v) => updateRow(record.allocation, { standard_qty: v })}
                />
              ),
            },
            {
              title: 'Reject',
              key: 'reject_qty',
              width: 100,
              render: (_, record) => (
                <InputNumber
                  size="small"
                  min={0}
                  style={{ width: '100%' }}
                  value={record.reject_qty}
                  onChange={(v) => updateRow(record.allocation, { reject_qty: v })}
                />
              ),
            },
            {
              title: 'Packed',
              key: 'packed_qty',
              width: 100,
              render: (_, record) => (
                <InputNumber
                  size="small"
                  min={0}
                  style={{ width: '100%' }}
                  value={record.packed_qty}
                  onChange={(v) => updateRow(record.allocation, { packed_qty: v })}
                />
              ),
            },
            {
              title: 'Mode',
              dataIndex: 'mode',
              width: 90,
              render: (mode: EditableRow['mode']) => (
                <Tag color={mode === 'MIXED' ? 'orange' : 'blue'}>
                  {mode === 'MIXED' ? 'Mixed' : 'Summary'}
                </Tag>
              ),
            },
          ]}
        />
      )}
    </Modal>
  )
}
