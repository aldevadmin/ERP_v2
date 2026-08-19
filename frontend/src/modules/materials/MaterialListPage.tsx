import { useCallback, useEffect, useState } from 'react'
import { Breadcrumb, Button, Card, Flex, Input, Space, Switch, Table, Typography } from 'antd'
import { Link, useNavigate } from 'react-router'
import StatusTag from '../../shared/components/StatusTag'
import { listMaterials } from './api'
import type { Material } from './types'

const { Title } = Typography

export default function MaterialListPage() {
  const navigate = useNavigate()
  const [materials, setMaterials] = useState<Material[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeOnly, setActiveOnly] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    listMaterials({ search: search || undefined, isActive: activeOnly ? true : undefined })
      .then((response) => setMaterials(response.results))
      .finally(() => setLoading(false))
  }, [search, activeOnly])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 12 }}
        items={[{ title: <Link to="/settings">Settings</Link> }, { title: 'Materials' }]}
      />
      <Card
        title={
          <Title level={4} style={{ margin: 0 }}>
            Materials
          </Title>
        }
        extra={
          <Button type="primary" onClick={() => navigate('/materials/new')}>
            New Material
          </Button>
        }
      >
        <Flex justify="space-between" style={{ marginBottom: 16 }} wrap="wrap" gap={12}>
          <Input.Search
            placeholder="Search by code or name"
            allowClear
            style={{ maxWidth: 320 }}
            onSearch={setSearch}
          />
          <Space>
            <span>Active only</span>
            <Switch checked={activeOnly} onChange={setActiveOnly} />
          </Space>
        </Flex>
        <Table<Material>
          rowKey="id"
          loading={loading}
          dataSource={materials}
          onRow={(record) => ({
            onClick: () => navigate(`/materials/${record.id}/edit`),
            style: { cursor: 'pointer' },
          })}
          columns={[
            { title: 'Code', dataIndex: 'code' },
            { title: 'Name', dataIndex: 'name' },
            { title: 'Unit', dataIndex: 'unit' },
            {
              title: 'Status',
              dataIndex: 'is_active',
              render: (isActive: boolean) => <StatusTag active={isActive} />,
            },
          ]}
        />
      </Card>
    </div>
  )
}
