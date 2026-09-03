import { useCallback, useEffect, useState } from 'react'
import {
  Button,
  Card,
  Flex,
  Input,
  Popconfirm,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd'
import { CopyOutlined, DeleteOutlined, ReadOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router'
import { ApiError } from '../../shared/api/http'
import StatusTag from '../../shared/components/StatusTag'
import { deleteItem, listItems, listMaterialTypes, listProductTypes } from './api'
import { ITEM_CLASS_LABELS } from './types'
import type { Item, ItemClass, MaterialType, ProductType } from './types'

const { Title } = Typography

const SETUP_GUIDE_URL = 'https://claude.ai/code/artifact/72596d3a-b271-42ba-be9f-323daf37a19c'

const TABS: { key: ItemClass | 'ALL'; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'RAW_MATERIAL', label: 'Raw Material' },
  { key: 'WIP', label: 'WIP' },
  { key: 'FINISHED_GOOD', label: 'Finished' },
  { key: 'PACKAGING_MATERIAL', label: 'Packaging' },
  { key: 'CONSUMABLE', label: 'Consumables' },
  { key: 'SCRAP_BY_PRODUCT', label: 'Scrap' },
]

function usageTags(item: Item): string[] {
  const tags: string[] = []
  if (item.manufacturable) tags.push('Made')
  if (item.stockable) tags.push('Stocked')
  if (item.sellable) tags.push('Sold')
  if (item.purchasable) tags.push('Bought')
  return tags
}

export default function ItemListPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<Item[]>([])
  const [productTypes, setProductTypes] = useState<ProductType[]>([])
  const [materialTypes, setMaterialTypes] = useState<MaterialType[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<ItemClass | 'ALL'>('ALL')
  const [search, setSearch] = useState('')
  const [productTypeFilter, setProductTypeFilter] = useState<number | undefined>(undefined)
  const [materialTypeFilter, setMaterialTypeFilter] = useState<number | undefined>(undefined)
  const [statusFilter, setStatusFilter] = useState<'true' | 'false' | undefined>('true')

  useEffect(() => {
    listProductTypes({ isActive: true }).then((response) => setProductTypes(response.results))
    listMaterialTypes({ isActive: true }).then((response) => setMaterialTypes(response.results))
  }, [])

  const load = useCallback(() => {
    setLoading(true)
    listItems({
      search: search || undefined,
      itemClass: activeTab === 'ALL' ? undefined : activeTab,
      productType: productTypeFilter,
      materialType: materialTypeFilter,
      isActive: statusFilter === undefined ? undefined : statusFilter === 'true',
    })
      .then((response) => setItems(response.results))
      .finally(() => setLoading(false))
  }, [search, activeTab, productTypeFilter, materialTypeFilter, statusFilter])

  useEffect(() => {
    load()
  }, [load])

  const handleDelete = async (item: Item) => {
    try {
      await deleteItem(item.id)
      message.success('Item deleted.')
      load()
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : 'Could not delete this item.')
    }
  }

  return (
    <div>
      <Card
        title={
          <Title level={4} style={{ margin: 0 }}>
            Items
          </Title>
        }
        extra={
          <Space>
            <Button href={SETUP_GUIDE_URL} target="_blank" rel="noreferrer" icon={<ReadOutlined />}>
              Setup Guide
            </Button>
            <Button type="primary" onClick={() => navigate('/items/new')}>
              Create Item
            </Button>
          </Space>
        }
      >
        <Typography.Paragraph type="secondary">
          All materials, WIP, finished products, packaging, and consumables used by the ERP.
        </Typography.Paragraph>
        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as ItemClass | 'ALL')}
          items={TABS.map((tab) => ({ key: tab.key, label: tab.label }))}
        />
        <Flex justify="space-between" style={{ marginBottom: 16 }} wrap="wrap" gap={12}>
          <Input.Search
            placeholder="Search items..."
            allowClear
            style={{ maxWidth: 320 }}
            onSearch={setSearch}
          />
          <Flex gap={12} wrap="wrap" align="center">
            <Select
              aria-label="Product Type"
              placeholder="Product Type"
              allowClear
              style={{ width: 180 }}
              value={productTypeFilter}
              onChange={setProductTypeFilter}
              options={productTypes.map((t) => ({ value: t.id, label: t.name }))}
            />
            <Select
              aria-label="Material Type"
              placeholder="Material Type"
              allowClear
              style={{ width: 180 }}
              value={materialTypeFilter}
              onChange={setMaterialTypeFilter}
              options={materialTypes.map((t) => ({ value: t.id, label: t.name }))}
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
        </Flex>
        <Table<Item>
          rowKey="id"
          loading={loading}
          dataSource={items}
          onRow={(record) => ({
            onClick: () => navigate(`/items/${record.id}/edit`),
            style: { cursor: 'pointer' },
          })}
          columns={[
            { title: 'Code', dataIndex: 'code' },
            { title: 'Item Name', dataIndex: 'name' },
            {
              title: 'Class',
              dataIndex: 'item_class',
              render: (value: ItemClass) => ITEM_CLASS_LABELS[value],
            },
            {
              title: 'Material',
              key: 'material_type',
              render: (_, record) => record.material_type_name || '—',
            },
            {
              title: 'Usage',
              key: 'usage',
              render: (_, record) => (
                <Space size={4}>
                  {usageTags(record).map((tag) => (
                    <Tag key={tag}>{tag}</Tag>
                  ))}
                  {usageTags(record).length === 0 && <span>—</span>}
                </Space>
              ),
            },
            {
              title: 'Status',
              dataIndex: 'is_active',
              render: (isActive: boolean) => <StatusTag active={isActive} />,
            },
            {
              title: '',
              key: 'actions',
              width: 88,
              render: (_, record) => (
                <Space onClick={(e) => e.stopPropagation()}>
                  <Button
                    size="small"
                    icon={<CopyOutlined />}
                    aria-label={`Duplicate ${record.name}`}
                    onClick={() => navigate('/items/new', { state: { duplicateFrom: record } })}
                  />
                  <Popconfirm
                    title="Delete this item?"
                    description="This can't be undone."
                    okText="Delete"
                    okButtonProps={{ danger: true }}
                    onConfirm={() => void handleDelete(record)}
                  >
                    <Button
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      aria-label={`Delete ${record.name}`}
                    />
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      </Card>
    </div>
  )
}
