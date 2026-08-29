import { useCallback, useEffect, useState } from 'react'
import {
  Breadcrumb,
  Button,
  Card,
  Flex,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Typography,
  message,
} from 'antd'
import { CopyOutlined, DeleteOutlined } from '@ant-design/icons'
import { Link, useNavigate } from 'react-router'
import { ApiError } from '../../shared/api/http'
import StatusTag from '../../shared/components/StatusTag'
import { deleteNamingTemplate, listItemFieldRules, listNamingTemplates } from './api'
import { fieldRulesForClass, ITEM_CLASS_LABELS, ITEM_CLASS_OPTIONS } from './types'
import type { ItemClass, ItemFieldRule, NamingTemplate } from './types'

const { Title, Text } = Typography

export default function NamingTemplateListPage() {
  const navigate = useNavigate()
  const [templates, setTemplates] = useState<NamingTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [itemClassFilter, setItemClassFilter] = useState<ItemClass | undefined>(undefined)
  const [activeOnly, setActiveOnly] = useState(true)
  const [fieldRules, setFieldRules] = useState<ItemFieldRule[]>([])

  const load = useCallback(() => {
    setLoading(true)
    listNamingTemplates({
      itemClass: itemClassFilter,
      isActive: activeOnly ? true : undefined,
    })
      .then((response) => setTemplates(response.results))
      .finally(() => setLoading(false))
  }, [itemClassFilter, activeOnly])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    listItemFieldRules().then(setFieldRules)
  }, [])

  const handleDelete = async (template: NamingTemplate) => {
    try {
      await deleteNamingTemplate(template.id)
      message.success('Naming template deleted.')
      load()
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : 'Could not delete this template.')
    }
  }

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 12 }}
        items={[{ title: <Link to="/settings">Settings</Link> }, { title: 'Naming Templates' }]}
      />
      <Card
        title={
          <Title level={4} style={{ margin: 0 }}>
            Naming Templates
          </Title>
        }
        extra={
          <Button type="primary" onClick={() => navigate('/naming-templates/new')}>
            Add Naming Template
          </Button>
        }
      >
        <Typography.Paragraph type="secondary">
          Suggests an Item Name/Code as its fields are filled in — never applied automatically,
          just a click-to-use hint. No template for a class/product type means Name/Code stay
          fully manual, same as today.
        </Typography.Paragraph>
        <Flex justify="space-between" style={{ marginBottom: 16 }} wrap="wrap" gap={12}>
          <Select
            aria-label="Item Class"
            placeholder="Filter by item class"
            allowClear
            style={{ width: 220 }}
            value={itemClassFilter}
            onChange={setItemClassFilter}
            options={ITEM_CLASS_OPTIONS}
          />
          <Space>
            <span>Active only</span>
            <Switch checked={activeOnly} onChange={setActiveOnly} />
          </Space>
        </Flex>
        <Table<NamingTemplate>
          rowKey="id"
          loading={loading}
          dataSource={templates}
          onRow={(record) => ({
            onClick: () => navigate(`/naming-templates/${record.id}/edit`),
            style: { cursor: 'pointer' },
          })}
          columns={[
            {
              title: 'Item Class',
              dataIndex: 'item_class',
              render: (value: ItemClass) => ITEM_CLASS_LABELS[value],
            },
            {
              title: 'Product Type',
              key: 'product_type',
              render: (_, record) => {
                const rules = fieldRulesForClass(fieldRules, record.item_class)
                if (rules.product_type === 'HIDDEN') {
                  return <Text type="secondary">Not configured</Text>
                }
                return record.product_type_name || 'All product types'
              },
            },
            {
              title: 'Shape',
              key: 'shape',
              render: (_, record) => {
                const rules = fieldRulesForClass(fieldRules, record.item_class)
                if (rules.shape === 'HIDDEN') {
                  return <Text type="secondary">Not configured</Text>
                }
                return record.shape_name || 'All shapes'
              },
            },
            { title: 'Name Pattern', dataIndex: 'name_pattern', render: (v: string) => v || '—' },
            { title: 'Code Pattern', dataIndex: 'code_pattern', render: (v: string) => v || '—' },
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
                    aria-label={`Duplicate template for ${ITEM_CLASS_LABELS[record.item_class]}`}
                    onClick={() =>
                      navigate('/naming-templates/new', { state: { duplicateFrom: record } })
                    }
                  />
                  <Popconfirm
                    title="Delete this naming template?"
                    description="This can't be undone."
                    okText="Delete"
                    okButtonProps={{ danger: true }}
                    onConfirm={() => void handleDelete(record)}
                  >
                    <Button
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      aria-label={`Delete template for ${ITEM_CLASS_LABELS[record.item_class]}`}
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
