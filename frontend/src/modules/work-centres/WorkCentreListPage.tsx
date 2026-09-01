import { useCallback, useEffect, useState } from 'react'
import {
  Button,
  Card,
  Flex,
  Input,
  Popconfirm,
  Select,
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
import { deleteWorkCentre, listWorkCentres, listWorkCentreTypes } from './api'
import type { WorkCentre, WorkCentreType } from './types'

const { Title } = Typography

export default function WorkCentreListPage() {
  const navigate = useNavigate()
  const [workCentres, setWorkCentres] = useState<WorkCentre[]>([])
  const [types, setTypes] = useState<WorkCentreType[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<number | undefined>(undefined)
  const [activeOnly, setActiveOnly] = useState(true)

  useEffect(() => {
    listWorkCentreTypes({ isActive: true }).then((response) => setTypes(response.results))
  }, [])

  const load = useCallback(() => {
    setLoading(true)
    listWorkCentres({
      search: search || undefined,
      isActive: activeOnly ? true : undefined,
      type: typeFilter,
    })
      .then((response) => setWorkCentres(response.results))
      .finally(() => setLoading(false))
  }, [search, activeOnly, typeFilter])

  useEffect(() => {
    load()
  }, [load])

  const handleDelete = async (workCentre: WorkCentre) => {
    try {
      await deleteWorkCentre(workCentre.id)
      message.success('Work centre deleted.')
      load()
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : 'Could not delete this work centre.')
    }
  }

  return (
    <div>
      <Card
        title={
          <Title level={4} style={{ margin: 0 }}>
            Work Centres
          </Title>
        }
        extra={
          <Button type="primary" onClick={() => navigate('/work-centres/new')}>
            New Work Centre
          </Button>
        }
      >
        <Typography.Paragraph type="secondary">
          The machines and stations Processes can declare a requirement for, and what each is
          capable of running.
        </Typography.Paragraph>
        <Flex justify="space-between" style={{ marginBottom: 16 }} wrap="wrap" gap={12}>
          <Input.Search
            placeholder="Search by code or name"
            allowClear
            style={{ maxWidth: 320 }}
            onSearch={setSearch}
          />
          <Flex gap={12} wrap="wrap" align="center">
            <Select
              aria-label="Type"
              placeholder="Type"
              allowClear
              style={{ width: 160 }}
              value={typeFilter}
              onChange={setTypeFilter}
              options={types.map((t) => ({ value: t.id, label: t.name }))}
            />
            <Space>
              <span>Active only</span>
              <Switch checked={activeOnly} onChange={setActiveOnly} />
            </Space>
          </Flex>
        </Flex>
        <Table<WorkCentre>
          rowKey="id"
          loading={loading}
          dataSource={workCentres}
          onRow={(record) => ({
            onClick: () => navigate(`/work-centres/${record.id}/edit`),
            style: { cursor: 'pointer' },
          })}
          columns={[
            { title: 'Code', dataIndex: 'code' },
            { title: 'Name', dataIndex: 'name' },
            { title: 'Type', dataIndex: 'type_name' },
            { title: 'Capable Processes', dataIndex: 'capabilities_count' },
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
                  title="Delete this work centre?"
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
