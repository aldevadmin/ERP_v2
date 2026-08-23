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
import { deleteMaterialType, listMaterialTypes } from './api'
import type { MaterialType } from './types'

const { Title } = Typography

export default function MaterialTypeListPage() {
  const navigate = useNavigate()
  const [types, setTypes] = useState<MaterialType[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeOnly, setActiveOnly] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    listMaterialTypes({ search: search || undefined, isActive: activeOnly ? true : undefined })
      .then((response) => setTypes(response.results))
      .finally(() => setLoading(false))
  }, [search, activeOnly])

  useEffect(() => {
    load()
  }, [load])

  const handleDelete = async (type: MaterialType) => {
    try {
      await deleteMaterialType(type.id)
      message.success('Material type deleted.')
      load()
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : 'Could not delete this material type.')
    }
  }

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 12 }}
        items={[{ title: <Link to="/settings">Settings</Link> }, { title: 'Material Types' }]}
      />
      <Card
        title={
          <Title level={4} style={{ margin: 0 }}>
            Material Types
          </Title>
        }
        extra={
          <Button type="primary" onClick={() => navigate('/material-types/new')}>
            Add Material Type
          </Button>
        }
      >
        <Typography.Paragraph type="secondary">
          What kind of material an Item is made from — e.g. Areca Palm, Wood Veneer, Paper.
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
        <Table<MaterialType>
          rowKey="id"
          loading={loading}
          dataSource={types}
          onRow={(record) => ({
            onClick: () => navigate(`/material-types/${record.id}/edit`),
            style: { cursor: 'pointer' },
          })}
          columns={[
            { title: 'Name', dataIndex: 'name' },
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
                  title="Delete this material type?"
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
