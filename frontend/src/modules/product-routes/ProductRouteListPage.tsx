import { useCallback, useEffect, useState } from 'react'
import {
  Button,
  Card,
  Dropdown,
  Flex,
  Input,
  Modal,
  Select,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import { MoreOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router'
import { ApiError } from '../../shared/api/http'
import StatusTag from '../../shared/components/StatusTag'
import { listItems } from '../items/api'
import type { Item } from '../items/types'
import {
  deleteProcessRoute,
  duplicateProcessRoute,
  listProcessRoutes,
  saveRouteVersion,
  updateProcessRoute,
} from './api'
import type { ProcessRoute } from './types'

const { Title } = Typography

export default function ProductRouteListPage() {
  const navigate = useNavigate()
  const [routes, setRoutes] = useState<ProcessRoute[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [itemFilter, setItemFilter] = useState<number | undefined>(undefined)
  const [statusFilter, setStatusFilter] = useState<'true' | 'false' | undefined>('true')

  const load = useCallback(() => {
    setLoading(true)
    listProcessRoutes({
      search: search || undefined,
      item: itemFilter,
      isActive: statusFilter === undefined ? undefined : statusFilter === 'true',
    })
      .then((response) => setRoutes(response.results))
      .finally(() => setLoading(false))
  }, [search, itemFilter, statusFilter])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    listItems({ isActive: true }).then((response) =>
      setItems(response.results.filter((i) => i.item_class === 'WIP' || i.item_class === 'FINISHED_GOOD')),
    )
  }, [])

  const handleDeactivate = async (route: ProcessRoute) => {
    await updateProcessRoute(route.id, { is_active: false })
    load()
  }

  const handleDuplicate = async (route: ProcessRoute) => {
    const copy = await duplicateProcessRoute(route.id)
    navigate(`/product-routes/${copy.id}/edit`)
  }

  const handleMakeDefault = async (route: ProcessRoute) => {
    await saveRouteVersion(route.version_id, { is_default: true })
    load()
  }

  const handleDelete = (route: ProcessRoute) => {
    Modal.confirm({
      title: 'Delete this route?',
      content: "This can't be undone.",
      okText: 'Delete',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteProcessRoute(route.id)
          message.success('Route deleted.')
          load()
        } catch (err) {
          message.error(err instanceof ApiError ? err.message : 'Could not delete this route.')
        }
      },
    })
  }

  return (
    <div>
      <Card
        title={
          <Title level={4} style={{ margin: 0 }}>
            Product Routes
          </Title>
        }
        extra={
          <Button type="primary" onClick={() => navigate('/product-routes/new')}>
            + New Route
          </Button>
        }
      >
        <Typography.Paragraph type="secondary">
          The sequence of processes a product goes through, from raw material to finished good.
        </Typography.Paragraph>
        <Flex justify="space-between" style={{ marginBottom: 16 }} wrap="wrap" gap={12}>
          <Input.Search
            placeholder="Search routes..."
            allowClear
            style={{ maxWidth: 320 }}
            onSearch={setSearch}
          />
          <Flex gap={12} wrap="wrap">
            <Select
              aria-label="Item"
              placeholder="Item"
              allowClear
              style={{ width: 200 }}
              value={itemFilter}
              onChange={setItemFilter}
              options={items.map((i) => ({ value: i.id, label: i.name }))}
            />
            <Select
              aria-label="Status"
              placeholder="Status"
              allowClear
              style={{ width: 160 }}
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: 'true', label: 'Active' },
                { value: 'false', label: 'Inactive' },
              ]}
            />
          </Flex>
        </Flex>
        <Table<ProcessRoute>
          rowKey="id"
          loading={loading}
          dataSource={routes}
          onRow={(record) => ({
            onClick: () => navigate(`/product-routes/${record.id}/edit`),
            style: { cursor: 'pointer' },
          })}
          columns={[
            { title: 'Route Name', dataIndex: 'name' },
            { title: 'Item / SKU', dataIndex: 'item_name' },
            {
              title: 'Steps',
              key: 'steps',
              render: (_, record) => record.nodes.length,
            },
            {
              title: 'Version',
              key: 'version',
              render: (_, record) => `v${record.version_number}`,
            },
            {
              title: 'Default',
              key: 'default',
              render: (_, record) => (record.is_default ? <Tag color="blue">Yes</Tag> : 'No'),
            },
            {
              title: 'Status',
              dataIndex: 'is_active',
              render: (isActive: boolean) => <StatusTag active={isActive} />,
            },
            {
              title: '',
              key: 'actions',
              render: (_, record) => (
                <Dropdown
                  trigger={['click']}
                  menu={{
                    items: [
                      { key: 'edit', label: 'Edit / New Version' },
                      { key: 'duplicate', label: 'Duplicate' },
                      ...(!record.is_default
                        ? [{ key: 'make-default', label: 'Make Default' }]
                        : []),
                      ...(record.is_active
                        ? [{ key: 'deactivate', label: 'Deactivate', danger: true }]
                        : []),
                      { key: 'delete', label: 'Delete', danger: true },
                    ],
                    onClick: ({ key, domEvent }) => {
                      domEvent.stopPropagation()
                      if (key === 'edit') navigate(`/product-routes/${record.id}/edit`)
                      if (key === 'duplicate') void handleDuplicate(record)
                      if (key === 'make-default') void handleMakeDefault(record)
                      if (key === 'deactivate') void handleDeactivate(record)
                      if (key === 'delete') handleDelete(record)
                    },
                  }}
                >
                  <Button
                    type="text"
                    icon={<MoreOutlined />}
                    aria-label={`Actions — ${record.name}`}
                    onClick={(e) => e.stopPropagation()}
                  />
                </Dropdown>
              ),
            },
          ]}
        />
      </Card>
    </div>
  )
}
