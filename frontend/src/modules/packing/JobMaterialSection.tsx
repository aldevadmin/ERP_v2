import { useCallback, useEffect, useState } from 'react'
import { Button, Flex, Table, Tag, Typography, message } from 'antd'
import { ApiError } from '../../shared/api/http'
import { listJobMaterialRequests, listJobMaterialRequirements, receiveMaterialRequest } from './api'
import WarehouseRequestModal from './WarehouseRequestModal'
import type {
  PackingJob,
  PackingMaterialRequest,
  PackingMaterialRequestLine,
  PackingMaterialRequirementRow,
} from './types'

const { Text } = Typography

interface MaterialRow extends PackingMaterialRequirementRow {
  line: PackingMaterialRequestLine | null
  requestId: number | null
}

/** A Job's material requirements + warehouse requests — always visible
 * wherever a Job is shown (Job Detail page, Packing Floor's focused Job)
 * rather than tucked behind a tab, since requesting/receiving material is
 * itself a transaction a supervisor needs quick access to, not background
 * reading.
 */
export default function JobMaterialSection({
  job,
  onChanged,
}: {
  job: PackingJob
  onChanged?: () => void
}) {
  const [requirements, setRequirements] = useState<PackingMaterialRequirementRow[]>([])
  const [requests, setRequests] = useState<PackingMaterialRequest[]>([])
  const [requestingFor, setRequestingFor] = useState<PackingMaterialRequirementRow | null>(null)

  const load = useCallback(() => {
    listJobMaterialRequirements(job.id).then(setRequirements)
    listJobMaterialRequests(job.id).then(setRequests)
  }, [job.id])

  useEffect(() => {
    load()
  }, [load])

  const handleReceive = async (requestId: number, lineId: number, requiredQty: number) => {
    try {
      await receiveMaterialRequest(requestId, [
        { request_line: lineId, quantity_issued: requiredQty, quantity_received: requiredQty },
      ])
      message.success('Material received.')
      load()
      onChanged?.()
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : 'Could not record receipt.')
    }
  }

  // One row per requirement, enriched with its matching request line (if
  // any) so "Requested/Issued/Received/Status" and the Mark Received
  // action sit right next to Required — instead of a second table below
  // repeating the same item.
  const rows: MaterialRow[] = requirements.map((r) => {
    for (const req of requests) {
      const line = req.lines.find((l) => l.item === r.item)
      if (line) return { ...r, line, requestId: req.id }
    }
    return { ...r, line: null, requestId: null }
  })

  return (
    <div>
      <Table<MaterialRow>
        rowKey="item"
        size="small"
        pagination={false}
        dataSource={rows}
        locale={{ emptyText: 'No material requirements for this Job.' }}
        columns={[
          { title: 'Item', dataIndex: 'item_label' },
          {
            title: 'Required',
            dataIndex: 'required_qty',
            render: (v: number, r) => `${v.toLocaleString()} ${r.uom_code}`,
          },
          {
            title: 'Status',
            key: 'status',
            render: (_, r) => {
              if (!r.line) return <Text type="secondary">Not requested</Text>
              return (
                <Flex vertical gap={0}>
                  <Tag style={{ width: 'fit-content' }}>{r.line.status}</Tag>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Requested {r.line.requested_qty} • Issued {r.line.issued_qty} • Received{' '}
                    {r.line.received_qty}
                  </Text>
                </Flex>
              )
            },
          },
          {
            title: '',
            key: 'actions',
            render: (_, r) => {
              if (!r.line || !r.requestId) {
                return (
                  <Button size="small" onClick={() => setRequestingFor(r)}>
                    Request From Warehouse
                  </Button>
                )
              }
              if (r.line.status === 'RECEIVED') return null
              const { requestId, line } = r
              return (
                <Button size="small" onClick={() => void handleReceive(requestId, line.id, line.balance_qty)}>
                  Mark Received
                </Button>
              )
            },
          },
        ]}
      />
      <WarehouseRequestModal
        open={requestingFor !== null}
        job={job}
        requirement={requestingFor}
        onClose={() => setRequestingFor(null)}
        onCreated={() => {
          setRequestingFor(null)
          load()
        }}
      />
    </div>
  )
}
