import { useEffect, useState } from 'react'
import { Alert, Button, Checkbox, Modal, Radio, Space, Table, Typography } from 'antd'
import { ApiError } from '../../shared/api/http'
import { listWorkCentres } from '../work-centres/api'
import type { WorkCentre } from '../work-centres/types'
import { autoAllocate, autoAllocationPreview } from './api'
import type { AutoAllocationRow, PackingJob } from './types'

const { Text } = Typography

export default function AutoAllocateModal({
  open,
  job,
  onClose,
  onAllocated,
}: {
  open: boolean
  job: PackingJob | null
  onClose: () => void
  onAllocated: () => void
}) {
  const [workCentres, setWorkCentres] = useState<WorkCentre[]>([])
  const [selected, setSelected] = useState<number[]>([])
  const [preview, setPreview] = useState<AutoAllocationRow[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (job) {
      listWorkCentres({ isActive: true }).then((response) =>
        setWorkCentres(response.results.filter((wc) => wc.bay === job.bay)),
      )
    }
  }, [job])

  useEffect(() => {
    if (open) {
      setSelected([])
      setPreview([])
      setError(null)
    }
  }, [open])

  if (!job) return null

  const remaining = job.target_qty - job.allocated_qty

  const handlePreview = async () => {
    setError(null)
    try {
      const response = await autoAllocationPreview(job.id, selected, job.date)
      setPreview(response.allocations)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not build a preview.')
    }
  }

  const handleApply = async () => {
    setError(null)
    setSubmitting(true)
    try {
      await autoAllocate(job.id, selected, job.date)
      onAllocated()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not apply allocation.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title="Auto Allocate"
      open={open}
      onCancel={onClose}
      footer={[
        <Button key="cancel" onClick={onClose}>
          Cancel
        </Button>,
        <Button key="preview" onClick={() => void handlePreview()} disabled={selected.length === 0}>
          Preview Allocation
        </Button>,
        <Button
          key="apply"
          type="primary"
          loading={submitting}
          disabled={preview.length === 0}
          onClick={() => void handleApply()}
        >
          Apply Allocation
        </Button>,
      ]}
      destroyOnHidden
    >
      {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}
      <Space direction="vertical" style={{ width: '100%' }}>
        <Text>Quantity: {remaining.toLocaleString()} pcs</Text>
        <Text>Available Work Centres: {workCentres.length}</Text>
        <Checkbox.Group
          style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
          value={selected}
          onChange={(values) => setSelected(values as number[])}
        >
          {workCentres.map((wc) => (
            <Checkbox key={wc.id} value={wc.id}>
              {wc.code} — {wc.name}
            </Checkbox>
          ))}
        </Checkbox.Group>
        <Text strong style={{ display: 'block', marginTop: 12 }}>
          Allocation Method
        </Text>
        <Radio.Group value="EQUAL">
          <Space direction="vertical">
            <Radio value="EQUAL">Equal</Radio>
            <Radio value="STANDARD_CAPACITY" disabled>
              Based on Standard Capacity
            </Radio>
            <Radio value="HISTORICAL" disabled>
              Historical Performance (Future)
            </Radio>
          </Space>
        </Radio.Group>
        {preview.length > 0 && (
          <Table
            size="small"
            rowKey="work_centre"
            pagination={false}
            dataSource={preview}
            style={{ marginTop: 12 }}
            columns={[
              {
                title: 'Work Centre',
                dataIndex: 'work_centre',
                render: (id: number) => workCentres.find((wc) => wc.id === id)?.code ?? id,
              },
              {
                title: 'Qty',
                dataIndex: 'assigned_qty',
                render: (v: number) => v.toLocaleString(),
              },
            ]}
          />
        )}
      </Space>
    </Modal>
  )
}
