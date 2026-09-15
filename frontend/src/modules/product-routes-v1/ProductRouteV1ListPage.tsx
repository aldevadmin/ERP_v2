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
import { listItemGroups } from '../items/api'
import type { ItemGroup } from '../items/types'
import {
  deleteProcessRouteV1,
  duplicateProcessRouteV1,
  listProcessRoutesV1,
  saveRouteVersionV1,
  updateProcessRouteV1,
} from './api'
import type { ProcessRouteV1 } from './types'

const { Title } = Typography

export default function ProductRouteV1ListPage() {
  const navigate = useNavigate()
  const [routes, setRoutes] = useState<ProcessRouteV1[]>([])
  const [itemGroups, setItemGroups] = useState<ItemGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [itemGroupFilter, setItemGroupFilter] = useState<number | undefined>(undefined)
  const [statusFilter, setStatusFilter] = useState<'true' | 'false' | undefined>('true')

  const load = useCallback(() => {
    setLoading(true)
    listProcessRoutesV1({
      search: search || undefined,
      itemGroup: itemGroupFilter,
      isActive: statusFilter === undefined ? undefined : statusFilter === 'true',
    })
      .then((response) => setRoutes(response.results))
      .finally(() => setLoading(false))
  }, [search, itemGroupFilter, statusFilter])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    listItemGroups({ isActive: true }).then((response) => setItemGroups(response.results))
  }, [])

  const handleDeactivate = async (route: ProcessRouteV1) => {
    await updateProcessRouteV1(route.id, { is_active: false })
    load()
  }

  const handleDuplicate = async (route: ProcessRouteV1) => {
    const copy = await duplicateProcessRouteV1(route.id)
    navigate(`/product-routes-v1/${copy.id}/edit`)
  }

  const handleMakeDefault = async (route: ProcessRouteV1) => {
    await saveRouteVersionV1(route.version_id, { is_default: true })
    load()
  }

  const handleDelete = (route: ProcessRouteV1) => {
    Modal.confirm({
      title: 'Delete this route?',
      content: "This can't be undone.",
      okText: 'Delete',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteProcessRouteV1(route.id)
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
            Product Routes V1
          </Title>
        }
        extra={
          <Button type="primary" onClick={() => navigate('/product-routes-v1/new')}>
            + New Route
          </Button>
        }
      >
        <Typography.Paragraph type="secondary">
          The sequence of processes a whole product family goes through — one route serves every
          size registered against it via Item Mappings, instead of one route per SKU. Alongside
          the original Product Routes module, not replacing it.
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
              aria-label="Item Group"
              placeholder="Item Group"
              allowClear
              style={{ width: 200 }}
              value={itemGroupFilter}
              onChange={setItemGroupFilter}
              options={itemGroups.map((g) => ({ value: g.id, label: g.name }))}
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
        <Table<ProcessRouteV1>
          rowKey="id"
          loading={loading}
          dataSource={routes}
          onRow={(record) => ({
            onClick: () => navigate(`/product-routes-v1/${record.id}/edit`),
            style: { cursor: 'pointer' },
          })}
          columns={[
            { title: 'Route Name', dataIndex: 'name' },
            { title: 'Item Group', dataIndex: 'item_group_name' },
            { title: 'Steps', key: 'steps', render: (_, record) => record.nodes.length },
            {
              title: 'Target Items',
              key: 'target_items',
              render: (_, record) => new Set(record.item_mappings.map((m) => m.target_item)).size,
            },
            { title: 'Version', key: 'version', render: (_, record) => `v${record.version_number}` },
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
                      if (key === 'edit') navigate(`/product-routes-v1/${record.id}/edit`)
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
