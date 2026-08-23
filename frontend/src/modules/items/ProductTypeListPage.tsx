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
import { deleteProductType, listProductTypes } from './api'
import type { ProductType } from './types'

const { Title } = Typography

export default function ProductTypeListPage() {
  const navigate = useNavigate()
  const [types, setTypes] = useState<ProductType[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeOnly, setActiveOnly] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    listProductTypes({ search: search || undefined, isActive: activeOnly ? true : undefined })
      .then((response) => setTypes(response.results))
      .finally(() => setLoading(false))
  }, [search, activeOnly])

  useEffect(() => {
    load()
  }, [load])

  const handleDelete = async (type: ProductType) => {
    try {
      await deleteProductType(type.id)
      message.success('Product type deleted.')
      load()
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : 'Could not delete this product type.')
    }
  }

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 12 }}
        items={[{ title: <Link to="/settings">Settings</Link> }, { title: 'Product Types' }]}
      />
      <Card
        title={
          <Title level={4} style={{ margin: 0 }}>
            Product Types
          </Title>
        }
        extra={
          <Button type="primary" onClick={() => navigate('/product-types/new')}>
            Add Product Type
          </Button>
        }
      >
        <Typography.Paragraph type="secondary">
          What kind of product an Item is — e.g. Plate, Bowl, Tray.
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
        <Table<ProductType>
          rowKey="id"
          loading={loading}
          dataSource={types}
          onRow={(record) => ({
            onClick: () => navigate(`/product-types/${record.id}/edit`),
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
                  title="Delete this product type?"
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
