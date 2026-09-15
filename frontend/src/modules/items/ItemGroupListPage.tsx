import { useCallback, useEffect, useState } from 'react'
import {
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
import { useNavigate } from 'react-router'
import { ApiError } from '../../shared/api/http'
import StatusTag from '../../shared/components/StatusTag'
import { deleteItemGroup, listItemGroups } from './api'
import type { ItemGroup } from './types'

const { Title, Text } = Typography

export default function ItemGroupListPage() {
  const navigate = useNavigate()
  const [groups, setGroups] = useState<ItemGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeOnly, setActiveOnly] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    listItemGroups({ search: search || undefined, isActive: activeOnly ? true : undefined })
      .then((response) => setGroups(response.results))
      .finally(() => setLoading(false))
  }, [search, activeOnly])

  useEffect(() => {
    load()
  }, [load])

  const handleDelete = async (group: ItemGroup) => {
    try {
      await deleteItemGroup(group.id)
      message.success('Item Group deleted.')
      load()
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : 'Could not delete this Item Group.')
    }
  }

  return (
    <div>
      <Card
        title={
          <Title level={4} style={{ margin: 0 }}>
            Item Groups
          </Title>
        }
        extra={
          <Button type="primary" onClick={() => navigate('/item-groups/new')}>
            New Item Group
          </Button>
        }
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
          A free-form tag for "items interchangeable at this role/stage" — e.g. "WIP – Sorted
          Plate – Areca Palm – Sq10x10". Used to define generic Process Input/Output slots that
          work across a whole family of item sizes, instead of one Process per SKU.
        </Text>
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
        <Table<ItemGroup>
          rowKey="id"
          loading={loading}
          dataSource={groups}
          onRow={(record) => ({
            onClick: () => navigate(`/item-groups/${record.id}/edit`),
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
                  title="Delete this Item Group?"
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
