import { useCallback, useEffect, useState } from 'react'
import { Breadcrumb, Button, Card, Flex, Input, Popconfirm, Table, Tag, Typography } from 'antd'
import { Link, useNavigate } from 'react-router'
import ProductsTabs from './ProductsTabs'
import { deleteCustomerSkuMapping, listCustomerSkuMappings } from './api'
import type { CustomerSKUMapping } from './types'

const { Title } = Typography

function hasPackingConfig(mapping: CustomerSKUMapping): boolean {
  return Boolean(
    mapping.pieces_per_pouch ||
      mapping.pouches_per_carton ||
      mapping.carton_ply_rating ||
      mapping.carton_length_mm ||
      mapping.pouch_thickness_microns ||
      mapping.has_retail_sticker !== null ||
      mapping.has_silica_gel !== null ||
      mapping.other_packing_requirements,
  )
}

export default function CustomerSkuMappingsPage() {
  const navigate = useNavigate()
  const [mappings, setMappings] = useState<CustomerSKUMapping[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    listCustomerSkuMappings({ search: search || undefined })
      .then((response) => setMappings(response.results))
      .finally(() => setLoading(false))
  }, [search])

  useEffect(() => {
    load()
  }, [load])

  const handleDelete = async (id: number) => {
    await deleteCustomerSkuMapping(id)
    load()
  }

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 12 }}
        items={[
          { title: <Link to="/settings">Settings</Link> },
          { title: 'Customer SKU Mappings' },
        ]}
      />
      <Card
        title={
          <Title level={4} style={{ margin: 0 }}>
            Customer SKU Mappings
          </Title>
        }
        extra={
          <Button type="primary" onClick={() => navigate('/products/mappings/new')}>
            New Mapping
          </Button>
        }
      >
        <ProductsTabs />
        <Input.Search
          placeholder="Search by customer SKU code"
          allowClear
          style={{ maxWidth: 320, marginBottom: 16 }}
          onSearch={setSearch}
        />
        <Table<CustomerSKUMapping>
          rowKey="id"
          loading={loading}
          dataSource={mappings}
          columns={[
            { title: 'Customer', dataIndex: 'customer_name' },
            { title: 'Customer SKU Code', dataIndex: 'customer_sku_code' },
            { title: 'Customer Description', dataIndex: 'customer_description' },
            { title: 'Internal SKU', dataIndex: 'product_sku_code' },
            {
              title: 'Packing',
              key: 'packing',
              render: (_, record) => (
                <Tag color={hasPackingConfig(record) ? 'success' : 'default'}>
                  {hasPackingConfig(record) ? 'Configured' : 'Not set'}
                </Tag>
              ),
            },
            {
              title: '',
              key: 'actions',
              render: (_, record) => (
                <Flex gap={8}>
                  <Button
                    size="small"
                    onClick={() => navigate(`/products/mappings/${record.id}/edit`)}
                  >
                    Edit
                  </Button>
                  <Popconfirm
                    title="Delete this mapping?"
                    onConfirm={() => handleDelete(record.id)}
                  >
                    <Button size="small" danger>
                      Delete
                    </Button>
                  </Popconfirm>
                </Flex>
              ),
            },
          ]}
        />
      </Card>
    </div>
  )
}
