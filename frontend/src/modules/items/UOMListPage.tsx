import { useCallback, useEffect, useState } from 'react'
import {
  Breadcrumb,
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
import { Link, useNavigate } from 'react-router'
import { ApiError } from '../../shared/api/http'
import StatusTag from '../../shared/components/StatusTag'
import { deleteUOM, listUOMs } from './api'
import type { UOM } from './types'

const { Title } = Typography

export default function UOMListPage() {
  const navigate = useNavigate()
  const [uoms, setUoms] = useState<UOM[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeOnly, setActiveOnly] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    listUOMs({ search: search || undefined, isActive: activeOnly ? true : undefined })
      .then((response) => setUoms(response.results))
      .finally(() => setLoading(false))
  }, [search, activeOnly])

  useEffect(() => {
    load()
  }, [load])

  const handleDelete = async (uom: UOM) => {
    try {
      await deleteUOM(uom.id)
      message.success('Unit of measure deleted.')
      load()
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : 'Could not delete this unit.')
    }
  }

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 12 }}
        items={[{ title: <Link to="/settings">Settings</Link> }, { title: 'Units of Measure' }]}
      />
      <Card
        title={
          <Title level={4} style={{ margin: 0 }}>
            Units of Measure
          </Title>
        }
        extra={
          <Button type="primary" onClick={() => navigate('/uoms/new')}>
            Add Unit
          </Button>
        }
      >
        <Typography.Paragraph type="secondary">
          The units Items are stocked, purchased, and sold in — e.g. Piece, Kilogram, Pouch, Carton.
        </Typography.Paragraph>
        <Flex justify="space-between" style={{ marginBottom: 16 }} wrap="wrap" gap={12}>
          <Input.Search
            placeholder="Search by name or code"
            allowClear
            style={{ maxWidth: 320 }}
            onSearch={setSearch}
          />
          <Space>
            <span>Active only</span>
            <Switch checked={activeOnly} onChange={setActiveOnly} />
          </Space>
        </Flex>
        <Table<UOM>
          rowKey="id"
          loading={loading}
          dataSource={uoms}
          onRow={(record) => ({
            onClick: () => navigate(`/uoms/${record.id}/edit`),
            style: { cursor: 'pointer' },
          })}
          columns={[
            { title: 'Code', dataIndex: 'code' },
            { title: 'Name', dataIndex: 'name' },
            { title: 'Decimal Places', dataIndex: 'decimal_scale' },
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
                  title="Delete this unit?"
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
