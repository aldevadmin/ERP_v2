import { useCallback, useEffect, useState } from 'react'
import {
  Button,
  Card,
  Flex,
  Input,
  Popconfirm,
  Select,
  Table,
  Typography,
  message,
} from 'antd'
import { DeleteOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router'
import { ApiError } from '../../shared/api/http'
import StatusTag from '../../shared/components/StatusTag'
import { deleteTooling, listTooling, listToolingTypes } from './api'
import type { Tooling, ToolingType } from './types'

const { Title } = Typography

export default function ToolingListPage() {
  const navigate = useNavigate()
  const [tooling, setTooling] = useState<Tooling[]>([])
  const [types, setTypes] = useState<ToolingType[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<number | undefined>(undefined)
  const [statusFilter, setStatusFilter] = useState<'true' | 'false' | undefined>('true')

  useEffect(() => {
    listToolingTypes({ isActive: true }).then((response) => setTypes(response.results))
  }, [])

  const load = useCallback(() => {
    setLoading(true)
    listTooling({
      search: search || undefined,
      type: typeFilter,
      isActive: statusFilter === undefined ? undefined : statusFilter === 'true',
    })
      .then((response) => setTooling(response.results))
      .finally(() => setLoading(false))
  }, [search, typeFilter, statusFilter])

  useEffect(() => {
    load()
  }, [load])

  const handleDelete = async (item: Tooling) => {
    try {
      await deleteTooling(item.id)
      message.success('Tooling deleted.')
      load()
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : 'Could not delete this tooling.')
    }
  }

  return (
    <div>
      <Card
        title={
          <Title level={4} style={{ margin: 0 }}>
            Tooling
          </Title>
        }
        extra={
          <Button type="primary" onClick={() => navigate('/tooling/new')}>
            + Add Tooling
          </Button>
        }
      >
        <Typography.Paragraph type="secondary">
          Reusable equipment used at a Work Centre to carry out a Process.
        </Typography.Paragraph>
        <Flex justify="space-between" style={{ marginBottom: 16 }} wrap="wrap" gap={12}>
          <Input.Search
            placeholder="Search tooling..."
            allowClear
            style={{ maxWidth: 320 }}
            onSearch={setSearch}
          />
          <Flex gap={12} wrap="wrap">
            <Select
              aria-label="Type"
              placeholder="Type"
              allowClear
              style={{ width: 180 }}
              value={typeFilter}
              onChange={setTypeFilter}
              options={types.map((t) => ({ value: t.id, label: t.name }))}
            />
            <Select
              aria-label="Status"
              placeholder="Status"
              allowClear
              style={{ width: 160 }}
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: 'true', label: 'Active' },
                { value: 'false', label: 'Inactive' },
              ]}
            />
          </Flex>
        </Flex>
        <Table<Tooling>
          rowKey="id"
          loading={loading}
          dataSource={tooling}
          onRow={(record) => ({
            onClick: () => navigate(`/tooling/${record.id}/edit`),
            style: { cursor: 'pointer' },
          })}
          columns={[
            { title: 'Code', dataIndex: 'code' },
            { title: 'Tooling Name', dataIndex: 'name' },
            { title: 'Type', dataIndex: 'tooling_type_name' },
            {
              title: 'Compatible Items',
              key: 'compatible',
              render: (_, record) => record.compatibilities_count,
            },
            {
              title: 'Std/hr',
              dataIndex: 'default_standard_rate',
              render: (v: number | null) => (v !== null ? v : '—'),
            },
            {
              title: 'Status',
              dataIndex: 'is_active',
              render: (isActive: boolean) => <StatusTag active={isActive} />,
            },
            {
              title: '',
              key: 'actions',
              width: 48,
              render: (_, record) => (
                <Popconfirm
                  title="Delete this tooling?"
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
