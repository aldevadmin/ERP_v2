import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Button, Card, Descriptions, Empty, Flex, Space, Spin, Table, Tag, Typography } from 'antd'
import StatusTag from '../../shared/components/StatusTag'
import { listCustomerProductMappings } from '../customer-mappings/api'
import type { CustomerProductMapping } from '../customer-mappings/types'
import { getCustomer } from './api'
import type { Customer } from './types'

const { Title, Text } = Typography

const ADDRESS_TYPE_LABELS: Record<string, string> = {
  BILLING: 'Billing',
  SHIPPING: 'Shipping',
  BILLING_AND_SHIPPING: 'Billing & Shipping',
}

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [mappings, setMappings] = useState<CustomerProductMapping[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    getCustomer(Number(id))
      .then(setCustomer)
      .catch(() => setCustomer(null))
      .finally(() => setLoading(false))
    listCustomerProductMappings({ customer: Number(id) }).then((response) =>
      setMappings(response.results),
    )
  }, [id])

  if (loading) {
    return (
      <Flex justify="center" style={{ paddingTop: 48 }}>
        <Spin size="large" />
      </Flex>
    )
  }

  if (!customer) {
    return <Empty description="Customer not found" style={{ paddingTop: 48 }} />
  }

  return (
    <Card
      style={{ maxWidth: 720, margin: '0 auto' }}
      title={
        <Space>
          <Title level={4} style={{ margin: 0 }}>
            {customer.name}
          </Title>
          <StatusTag active={customer.is_active} />
        </Space>
      }
      extra={<Button onClick={() => navigate(`/customers/${customer.id}/edit`)}>Edit</Button>}
    >
      <Descriptions column={1} bordered size="small">
        <Descriptions.Item label="Customer Code">{customer.code}</Descriptions.Item>
        <Descriptions.Item label="Main PoC">{customer.main_poc || '—'}</Descriptions.Item>
        <Descriptions.Item label="Email IDs">
          {customer.emails.length > 0 ? customer.emails.join(', ') : '—'}
        </Descriptions.Item>
        <Descriptions.Item label="Phone Number(s)">
          {customer.phone_numbers.length > 0 ? customer.phone_numbers.join(', ') : '—'}
        </Descriptions.Item>
        <Descriptions.Item label="Internal Coordinator">
          {customer.internal_coordinator_detail?.full_name ?? '—'}
        </Descriptions.Item>
      </Descriptions>

      <Title level={5} style={{ marginTop: 24 }}>
        Addresses
      </Title>
      {customer.addresses.length === 0 && (
        <Text type="secondary">No addresses on file.</Text>
      )}
      <Space orientation="vertical" style={{ width: '100%' }} size="middle">
        {customer.addresses.map((address) => (
          <Card
            key={address.id}
            size="small"
            type="inner"
            title={ADDRESS_TYPE_LABELS[address.address_type]}
          >
            <div>{address.line1}</div>
            {address.line2 && <div>{address.line2}</div>}
            {address.line3 && <div>{address.line3}</div>}
            <div>{[address.state, address.pin].filter(Boolean).join(', ')}</div>
            <div>{address.country}</div>
          </Card>
        ))}
      </Space>

      <Title level={5} style={{ marginTop: 24 }}>
        Products
      </Title>
      <Table<CustomerProductMapping>
        rowKey="id"
        size="small"
        dataSource={mappings}
        pagination={false}
        locale={{ emptyText: 'No products mapped to this customer yet.' }}
        onRow={(record) => ({
          onClick: () => navigate(`/customer-product-mappings/${record.id}/edit`),
          style: { cursor: 'pointer' },
        })}
        columns={[
          { title: 'Item', dataIndex: 'item_name' },
          { title: 'Customer SKU', dataIndex: 'customer_sku' },
          {
            title: 'Status',
            render: (_, r) =>
              r.current_version ? (
                <Tag color={r.current_version.status === 'PUBLISHED' ? 'green' : 'default'}>
                  v{r.current_version.version_number} — {r.current_version.status}
                </Tag>
              ) : (
                '—'
              ),
          },
        ]}
      />
      <Space style={{ marginTop: 12 }}>
        <Link to="/customer-product-mappings/new">+ Map a product for this customer</Link>
      </Space>
    </Card>
  )
}
