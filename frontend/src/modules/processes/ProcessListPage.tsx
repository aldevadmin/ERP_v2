import { useCallback, useEffect, useState } from 'react'
import {
  Breadcrumb,
  Button,
  Card,
  Dropdown,
  Flex,
  Input,
  Modal,
  Select,
  Table,
  Typography,
  message,
} from 'antd'
import { MoreOutlined, ReadOutlined } from '@ant-design/icons'
import { Link, useNavigate } from 'react-router'
import { ApiError } from '../../shared/api/http'
import StatusTag from '../../shared/components/StatusTag'
import {
  deleteProcess,
  duplicateProcess,
  listProcessCategories,
  listProcesses,
  updateProcess,
} from './api'
import type { Process, ProcessCategory, WorkCentreRequirement } from './types'
import { WORK_CENTRE_REQUIREMENT_OPTIONS } from './types'

const { Title } = Typography

const SETUP_GUIDE_URL = 'https://claude.ai/code/artifact/7b4b83f1-ded4-4e18-8b41-5aeb1478cf2b'

const WORK_CENTRE_REQUIREMENT_LABELS: Record<WorkCentreRequirement, string> = Object.fromEntries(
  WORK_CENTRE_REQUIREMENT_OPTIONS.map((option) => [option.value, option.label]),
) as Record<WorkCentreRequirement, string>

export default function ProcessListPage() {
  const navigate = useNavigate()
  const [processes, setProcesses] = useState<Process[]>([])
  const [categories, setCategories] = useState<ProcessCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<number | undefined>(undefined)
  const [statusFilter, setStatusFilter] = useState<'true' | 'false' | undefined>('true')

  const load = useCallback(() => {
    setLoading(true)
    listProcesses({
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

  const handleDeactivate = async (process: Process) => {
    await updateProcess(process.id, { is_active: false })
    load()
  }

  const handleDuplicate = async (process: Process) => {
    const copy = await duplicateProcess(process.id)
    navigate(`/processes/${copy.id}/edit`)
  }

  const handleDelete = (process: Process) => {
    Modal.confirm({
      title: 'Delete this process?',
      content: "This can't be undone.",
      okText: 'Delete',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteProcess(process.id)
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
      <Breadcrumb
        style={{ marginBottom: 12 }}
        items={[{ title: <Link to="/settings">Settings</Link> }, { title: 'Processes' }]}
      />
      <Card
        title={
          <Title level={4} style={{ margin: 0 }}>
            Processes
          </Title>
        }
        extra={
          <Flex gap={8}>
            <Button href={SETUP_GUIDE_URL} target="_blank" rel="noreferrer" icon={<ReadOutlined />}>
              Setup Guide
            </Button>
            <Button type="primary" onClick={() => navigate('/processes/new')}>
              Create Process
            </Button>
          </Flex>
        }
      >
        <Typography.Paragraph type="secondary">
          Define reusable activities used across Production, Packing and Inventory.
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
        <Table<Process>
          rowKey="id"
          loading={loading}
          dataSource={processes}
          onRow={(record) => ({
            onClick: () => navigate(`/processes/${record.id}/edit`),
            style: { cursor: 'pointer' },
          })}
          columns={[
            { title: 'Process', dataIndex: 'name' },
            { title: 'Category', dataIndex: 'category_name' },
            {
              title: 'Inputs',
              key: 'inputs',
              render: (_, record) => record.inputs.length,
            },
            {
              title: 'Outputs',
              key: 'outputs',
              render: (_, record) => record.outputs.length,
            },
            {
              title: 'Work Centre',
              dataIndex: 'work_centre_requirement',
              render: (value: WorkCentreRequirement | '') =>
                value ? WORK_CENTRE_REQUIREMENT_LABELS[value] : '—',
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
                      { key: 'edit', label: 'Edit' },
                      { key: 'duplicate', label: 'Duplicate' },
                      ...(record.is_active
                        ? [{ key: 'deactivate', label: 'Deactivate', danger: true }]
                        : []),
                      { key: 'delete', label: 'Delete', danger: true },
                    ],
                    onClick: ({ key, domEvent }) => {
                      domEvent.stopPropagation()
                      if (key === 'edit') navigate(`/processes/${record.id}/edit`)
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
