import { useCallback, useEffect, useState } from 'react'
import {
  Button,
  Card,
  Flex,
  Input,
  Popconfirm,
  Space,
  Switch,
  Table,
  Typography,
  message,
} from 'antd'
import { DeleteOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router'
import { ApiError } from '../../shared/api/http'
import StatusTag from '../../shared/components/StatusTag'
import { deleteShift, listShifts } from './api'
import type { Shift } from './types'

const { Title } = Typography

export default function ShiftListPage() {
  const navigate = useNavigate()
  const [shifts, setShifts] = useState<Shift[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeOnly, setActiveOnly] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    listShifts({ isActive: activeOnly ? true : undefined })
      .then((response) => {
        const results = search
          ? response.results.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()))
          : response.results
        setShifts(results)
      })
      .finally(() => setLoading(false))
  }, [search, activeOnly])

  useEffect(() => {
    load()
  }, [load])

  const handleDelete = async (shift: Shift) => {
    try {
      await deleteShift(shift.id)
      message.success('Shift deleted.')
      load()
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : 'Could not delete this shift.')
    }
  }

  return (
    <div>
      <Card
        title={
          <Title level={4} style={{ margin: 0 }}>
            Shifts
          </Title>
        }
        extra={
          <Button type="primary" onClick={() => navigate('/shifts/new')}>
            New Shift
          </Button>
        }
      >
        <Typography.Paragraph type="secondary">
          The packing floor's shifts (e.g. Shift 1, Shift 2) — used by weekly planning and
          work-centre allocation.
        </Typography.Paragraph>
        <Flex justify="space-between" style={{ marginBottom: 16 }} wrap="wrap" gap={12}>
          <Input.Search
            placeholder="Search by name"
            allowClear
            style={{ maxWidth: 320 }}
            onSearch={setSearch}
          />
          <Space>
            <span>Active only</span>
            <Switch checked={activeOnly} onChange={setActiveOnly} />
          </Space>
        </Flex>
        <Table<Shift>
          rowKey="id"
          loading={loading}
          dataSource={shifts}
          onRow={(record) => ({
            onClick: () => navigate(`/shifts/${record.id}/edit`),
            style: { cursor: 'pointer' },
          })}
          columns={[
            { title: 'Code', dataIndex: 'code', width: 120 },
            { title: 'Name', dataIndex: 'name' },
            { title: 'Start', dataIndex: 'start_time', width: 100, render: (v: string) => v || '—' },
            { title: 'End', dataIndex: 'end_time', width: 100, render: (v: string) => v || '—' },
            {
              title: 'Status',
              dataIndex: 'is_active',
              width: 120,
              render: (isActive: boolean) => <StatusTag active={isActive} />,
            },
            {
              title: '',
              key: 'actions',
              width: 48,
              render: (_, record) => (
                <Popconfirm
                  title="Delete this shift?"
                  description="This can't be undone."
                  okText="Delete"
                  okButtonProps={{ danger: true }}
                  onConfirm={(e) => {
                    e?.stopPropagation()
                    void handleDelete(record)
                  }}
                  onCancel={(e) => e?.stopPropagation()}
                >
                  <Button
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    aria-label={`Delete ${record.name}`}
                    onClick={(e) => e.stopPropagation()}
                  />
                </Popconfirm>
              ),
            },
          ]}
        />
      </Card>
    </div>
  )
}
