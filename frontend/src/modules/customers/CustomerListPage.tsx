import { useCallback, useEffect, useState } from 'react'
import { Button, Card, Flex, Input, Space, Switch, Table, Typography } from 'antd'
import { useNavigate } from 'react-router'
import StatusTag from '../../shared/components/StatusTag'
import { listCustomers } from './api'
import type { CustomerListItem } from './types'

const { Title } = Typography

export default function CustomerListPage() {
  const navigate = useNavigate()
  const [customers, setCustomers] = useState<CustomerListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeOnly, setActiveOnly] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    listCustomers({ search: search || undefined, isActive: activeOnly ? true : undefined })
      .then((response) => setCustomers(response.results))
      .finally(() => setLoading(false))
  }, [search, activeOnly])

  useEffect(() => {
    load()
  }, [load])

  return (
    <Card
      title={
        <Title level={4} style={{ margin: 0 }}>
          Customers
        </Title>
      }
      extra={
        <Button type="primary" onClick={() => navigate('/customers/new')}>
          New Customer
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
      <Table<CustomerListItem>
        rowKey="id"
        loading={loading}
        dataSource={customers}
        onRow={(record) => ({
          onClick: () => navigate(`/customers/${record.id}`),
          style: { cursor: 'pointer' },
        })}
        columns={[
          { title: 'Code', dataIndex: 'code' },
          { title: 'Name', dataIndex: 'name' },
          { title: 'Main PoC', dataIndex: 'main_poc', render: (v: string) => v || '—' },
          {
            title: 'Internal Coordinator',
            key: 'internal_coordinator',
            render: (_, record) => record.internal_coordinator_detail?.full_name ?? '—',
          },
          {
            title: 'Status',
            dataIndex: 'is_active',
            render: (isActive: boolean) => <StatusTag active={isActive} />,
          },
        ]}
      />
    </Card>
  )
}
