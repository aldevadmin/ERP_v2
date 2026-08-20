import { useCallback, useEffect, useState } from 'react'
import { Breadcrumb, Button, Card, Flex, Input, Space, Switch, Table, Typography } from 'antd'
import { Link, useNavigate } from 'react-router'
import StatusTag from '../../shared/components/StatusTag'
import { listOutputClassifications } from './api'
import type { OutputClassification } from './types'

const { Title } = Typography

export default function OutputClassificationListPage() {
  const navigate = useNavigate()
  const [classifications, setClassifications] = useState<OutputClassification[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeOnly, setActiveOnly] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    listOutputClassifications({
      search: search || undefined,
      isActive: activeOnly ? true : undefined,
    })
      .then((response) => setClassifications(response.results))
      .finally(() => setLoading(false))
  }, [search, activeOnly])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 12 }}
        items={[{ title: <Link to="/settings">Settings</Link> }, { title: 'Output Classifications' }]}
      />
      <Card
        title={
          <Title level={4} style={{ margin: 0 }}>
            Output Classifications
          </Title>
        }
        extra={
          <Button type="primary" onClick={() => navigate('/output-classifications/new')}>
            New Classification
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
        <Table<OutputClassification>
          rowKey="id"
          loading={loading}
          dataSource={classifications}
          onRow={(record) => ({
            onClick: () => navigate(`/output-classifications/${record.id}/edit`),
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
