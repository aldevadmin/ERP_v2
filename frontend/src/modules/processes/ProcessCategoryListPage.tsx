import { useCallback, useEffect, useState } from 'react'
import { Breadcrumb, Button, Card, Flex, Input, Space, Switch, Table, Typography } from 'antd'
import { Link, useNavigate } from 'react-router'
import StatusTag from '../../shared/components/StatusTag'
import { listProcessCategories } from './api'
import type { ProcessCategory } from './types'

const { Title } = Typography

export default function ProcessCategoryListPage() {
  const navigate = useNavigate()
  const [categories, setCategories] = useState<ProcessCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeOnly, setActiveOnly] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    listProcessCategories({ search: search || undefined, isActive: activeOnly ? true : undefined })
      .then((response) => setCategories(response.results))
      .finally(() => setLoading(false))
  }, [search, activeOnly])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 12 }}
        items={[{ title: <Link to="/settings">Settings</Link> }, { title: 'Process Categories' }]}
      />
      <Card
        title={
          <Title level={4} style={{ margin: 0 }}>
            Process Categories
          </Title>
        }
        extra={
          <Button type="primary" onClick={() => navigate('/process-categories/new')}>
            New Category
          </Button>
        }
      >
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
        <Table<ProcessCategory>
          rowKey="id"
          loading={loading}
          dataSource={categories}
          onRow={(record) => ({
            onClick: () => navigate(`/process-categories/${record.id}/edit`),
            style: { cursor: 'pointer' },
          })}
          columns={[
            { title: 'Name', dataIndex: 'name' },
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
