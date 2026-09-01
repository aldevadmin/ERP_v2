import { useCallback, useEffect, useState } from 'react'
import { Button, Card, Flex, Input, Popconfirm, Select, Table, Tag, Typography, message } from 'antd'
import { DeleteOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router'
import { ApiError } from '../../shared/api/http'
import { deleteCustomerProductMapping, listCustomerProductMappings } from './api'
import type { CustomerProductMapping, MappingVersionStatus } from './types'

const { Title } = Typography

const STATUS_COLORS: Record<MappingVersionStatus, string> = {
  DRAFT: 'default',
  PUBLISHED: 'green',
  RETIRED: 'orange',
}

export default function CustomerProductMappingListPage() {
  const navigate = useNavigate()
  const [mappings, setMappings] = useState<CustomerProductMapping[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'true' | 'false' | undefined>('true')

  const load = useCallback(() => {
    setLoading(true)
    listCustomerProductMappings({
      search: search || undefined,
      isActive: statusFilter === undefined ? undefined : statusFilter === 'true',
    })
      .then((response) => setMappings(response.results))
      .finally(() => setLoading(false))
  }, [search, statusFilter])

  useEffect(() => {
    load()
  }, [load])

  const handleDelete = async (mapping: CustomerProductMapping) => {
    try {
      await deleteCustomerProductMapping(mapping.id)
      message.success('Mapping deleted.')
      load()
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : 'Could not delete this mapping.')
    }
  }

  return (
    <div>
      <Card
        title={
          <Title level={4} style={{ margin: 0 }}>
            Customer Product Mappings
          </Title>
        }
        extra={
          <Button type="primary" onClick={() => navigate('/customer-product-mappings/new')}>
            Create Mapping
          </Button>
        }
      >
        <Typography.Paragraph type="secondary">
          Which customer buys which item, and under what commercial and packing terms.
        </Typography.Paragraph>
        <Flex justify="space-between" style={{ marginBottom: 16 }} wrap="wrap" gap={12}>
          <Input.Search
            placeholder="Search mappings..."
            allowClear
            style={{ maxWidth: 320 }}
            onSearch={setSearch}
          />
          <Select
            aria-label="Status"
            placeholder="Status"
            allowClear
            style={{ width: 140 }}
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: 'true', label: 'Active' },
              { value: 'false', label: 'Inactive' },
            ]}
          />
        </Flex>
        <Table<CustomerProductMapping>
          rowKey="id"
          loading={loading}
          dataSource={mappings}
          onRow={(record) => ({
            onClick: () => navigate(`/customer-product-mappings/${record.id}/edit`),
            style: { cursor: 'pointer' },
          })}
          columns={[
            { title: 'Mapping Code', dataIndex: 'mapping_code' },
            { title: 'Customer', dataIndex: 'customer_name' },
            { title: 'Item', dataIndex: 'item_name' },
            { title: 'Customer SKU', dataIndex: 'customer_sku' },
            {
              title: 'Version',
              key: 'version',
              render: (_, record) =>
                record.current_version ? (
                  <Tag color={STATUS_COLORS[record.current_version.status]}>
                    v{record.current_version.version_number} — {record.current_version.status}
                  </Tag>
                ) : (
                  '—'
                ),
            },
            {
              title: '',
              key: 'actions',
              width: 48,
              render: (_, record) => (
                <Popconfirm
                  title="Delete this mapping?"
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
                    aria-label={`Delete ${record.mapping_code}`}
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
