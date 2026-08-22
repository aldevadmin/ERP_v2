import { useEffect, useState } from 'react'
import { Modal, Table, Typography } from 'antd'
import dayjs from 'dayjs'
import { listWorkCentrePositionAssignments } from './api'
import type { ToolingAssignment, WorkCentrePosition } from './types'

const { Text } = Typography

function formatDate(value: string | null): string {
  return value ? dayjs(value).format('DD MMM YYYY, HH:mm') : 'Current'
}

export default function AssignmentHistoryModal({
  open,
  position,
  onClose,
}: {
  open: boolean
  position: WorkCentrePosition | null
  onClose: () => void
}) {
  const [history, setHistory] = useState<ToolingAssignment[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !position) return
    setLoading(true)
    listWorkCentrePositionAssignments(position.id)
      .then(setHistory)
      .finally(() => setLoading(false))
  }, [open, position])

  return (
    <Modal
      title={
        position
          ? `${position.installed_tooling_code || 'Position'} — Assignment History`
          : 'Assignment History'
      }
      open={open}
      onCancel={onClose}
      footer={null}
      mask={{ closable: false }}
      width={700}
      destroyOnHidden
    >
      <Table<ToolingAssignment>
        rowKey="id"
        size="small"
        loading={loading}
        pagination={false}
        dataSource={history}
        locale={{ emptyText: 'No assignments yet.' }}
        columns={[
          { title: 'From', key: 'from', render: (_, row) => formatDate(row.effective_from) },
          { title: 'To', key: 'to', render: (_, row) => formatDate(row.effective_to) },
          { title: 'Work Centre', dataIndex: 'work_centre_name' },
          { title: 'Position', dataIndex: 'position_index' },
          {
            title: 'Tooling',
            key: 'tooling',
            render: (_, row) => (
              <Text>
                {row.tooling_code} • {row.tooling_name}
              </Text>
            ),
          },
          { title: 'SKU', dataIndex: 'default_item_label' },
        ]}
      />
    </Modal>
  )
}
