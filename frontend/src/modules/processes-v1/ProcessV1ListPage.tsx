import { useCallback, useEffect, useState } from 'react'
import { Button, Card, Dropdown, Flex, Input, Modal, Select, Table, Typography, message } from 'antd'
import { MoreOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router'
import { ApiError } from '../../shared/api/http'
import StatusTag from '../../shared/components/StatusTag'
import { listProcessCategories } from '../processes/api'
import type { ProcessCategory } from '../processes/types'
import { deleteProcessV1, duplicateProcessV1, listProcessesV1, updateProcessV1 } from './api'
import type { ProcessV1 } from './types'

const { Title } = Typography

export default function ProcessV1ListPage() {
  const navigate = useNavigate()
  const [processes, setProcesses] = useState<ProcessV1[]>([])
  const [categories, setCategories] = useState<ProcessCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<number | undefined>(undefined)
  const [statusFilter, setStatusFilter] = useState<'true' | 'false' | undefined>('true')

  const load = useCallback(() => {
    setLoading(true)
    listProcessesV1({
      search: search || undefined,
      category: categoryFilter,
      isActive: statusFilter === undefined ? undefined : statusFilter === 'true',
    })
      .then((response) => setProcesses(response.results))
      .finally(() => setLoading(false))
  }, [search, categoryFilter, statusFilter])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    listProcessCategories({ isActive: true }).then((response) => setCategories(response.results))
  }, [])

  const handleDeactivate = async (process: ProcessV1) => {
    await updateProcessV1(process.id, { is_active: false })
    load()
  }

  const handleDuplicate = async (process: ProcessV1) => {
    const copy = await duplicateProcessV1(process.id)
    navigate(`/processes-v1/${copy.id}/edit`)
  }

  const handleDelete = (process: ProcessV1) => {
    Modal.confirm({
      title: 'Delete this process?',
      content: "This can't be undone.",
      okText: 'Delete',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteProcessV1(process.id)
          message.success('Process deleted.')
          load()
        } catch (err) {
          message.error(err instanceof ApiError ? err.message : 'Could not delete this process.')
        }
      },
    })
  }

  return (
    <div>
      <Card
        title={
          <Title level={4} style={{ margin: 0 }}>
            Processes V1
          </Title>
        }
        extra={
          <Button type="primary" onClick={() => navigate('/processes-v1/new')}>
            Create Process
          </Button>
        }
      >
        <Typography.Paragraph type="secondary">
          The generalized process engine — Input/Output slots match by Item Group (a whole family
          of item sizes) instead of one exact item, so one Process configuration works across
          every size. Alongside the original Processes module, not replacing it.
        </Typography.Paragraph>
        <Flex justify="space-between" style={{ marginBottom: 16 }} wrap="wrap" gap={12}>
          <Input.Search
            placeholder="Search processes..."
            allowClear
            style={{ maxWidth: 320 }}
            onSearch={setSearch}
          />
          <Flex gap={12} wrap="wrap">
            <Select
              aria-label="Category"
              placeholder="Category"
              allowClear
              style={{ width: 180 }}
              value={categoryFilter}
              onChange={setCategoryFilter}
              options={categories.map((c) => ({ value: c.id, label: c.name }))}
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
        <Table<ProcessV1>
          rowKey="id"
          loading={loading}
          dataSource={processes}
          onRow={(record) => ({
            onClick: () => navigate(`/processes-v1/${record.id}/edit`),
            style: { cursor: 'pointer' },
          })}
          columns={[
            { title: 'Process', dataIndex: 'name' },
            { title: 'Category', dataIndex: 'category_name' },
            { title: 'Inputs', key: 'inputs', render: (_, record) => record.inputs.length },
            { title: 'Outputs', key: 'outputs', render: (_, record) => record.outputs.length },
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
                      { key: 'edit', label: 'Edit' },
                      { key: 'duplicate', label: 'Duplicate' },
                      ...(record.is_active
                        ? [{ key: 'deactivate', label: 'Deactivate', danger: true }]
                        : []),
                      { key: 'delete', label: 'Delete', danger: true },
                    ],
                    onClick: ({ key, domEvent }) => {
                      domEvent.stopPropagation()
                      if (key === 'edit') navigate(`/processes-v1/${record.id}/edit`)
                      if (key === 'duplicate') void handleDuplicate(record)
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
