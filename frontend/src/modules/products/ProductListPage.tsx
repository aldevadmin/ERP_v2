import { useCallback, useEffect, useState } from 'react'
import { Breadcrumb, Button, Card, Flex, Input, Space, Switch, Table, Typography } from 'antd'
import { Link, useNavigate } from 'react-router'
import StatusTag from '../../shared/components/StatusTag'
import ProductsTabs from './ProductsTabs'
import { listProducts } from './api'
import type { Product } from './types'

const { Title } = Typography

export default function ProductListPage() {
  const navigate = useNavigate()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeOnly, setActiveOnly] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    listProducts({ search: search || undefined, isActive: activeOnly ? true : undefined })
      .then((response) => setProducts(response.results))
      .finally(() => setLoading(false))
  }, [search, activeOnly])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 12 }}
        items={[{ title: <Link to="/settings">Settings</Link> }, { title: 'Products' }]}
      />
      <Card
        title={
          <Title level={4} style={{ margin: 0 }}>
            Products
          </Title>
        }
        extra={
          <Button type="primary" onClick={() => navigate('/products/new')}>
            New Product
          </Button>
        }
      >
        <ProductsTabs />
        <Flex justify="space-between" style={{ marginBottom: 16 }} wrap="wrap" gap={12}>
          <Input.Search
            placeholder="Search by SKU code or name"
            allowClear
            style={{ maxWidth: 320 }}
            onSearch={setSearch}
          />
          <Space>
            <span>Active only</span>
            <Switch checked={activeOnly} onChange={setActiveOnly} />
          </Space>
        </Flex>
        <Table<Product>
          rowKey="id"
          loading={loading}
          dataSource={products}
          onRow={(record) => ({
            onClick: () => navigate(`/products/${record.id}/edit`),
            style: { cursor: 'pointer' },
          })}
          columns={[
            { title: 'SKU Code', dataIndex: 'sku_code' },
            { title: 'Name', dataIndex: 'name' },
            { title: 'Base Unit', dataIndex: 'base_unit' },
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
