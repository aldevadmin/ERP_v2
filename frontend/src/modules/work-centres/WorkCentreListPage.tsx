import { useCallback, useEffect, useState } from 'react'
import { Breadcrumb, Button, Card, Flex, Input, Select, Space, Switch, Table, Typography } from 'antd'
import { Link, useNavigate } from 'react-router'
import StatusTag from '../../shared/components/StatusTag'
import { listWorkCentres } from './api'
import { WORK_CENTRE_TYPE_OPTIONS } from './types'
import type { WorkCentre, WorkCentreType } from './types'

const { Title } = Typography

const TYPE_LABELS: Record<WorkCentreType, string> = Object.fromEntries(
  WORK_CENTRE_TYPE_OPTIONS.map((option) => [option.value, option.label]),
) as Record<WorkCentreType, string>

export default function WorkCentreListPage() {
  const navigate = useNavigate()
  const [workCentres, setWorkCentres] = useState<WorkCentre[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<WorkCentreType | undefined>(undefined)
  const [activeOnly, setActiveOnly] = useState(true)

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

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 12 }}
        items={[{ title: <Link to="/settings">Settings</Link> }, { title: 'Work Centres' }]}
      />
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
              options={WORK_CENTRE_TYPE_OPTIONS}
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
            {
              title: 'Type',
              dataIndex: 'type',
              render: (value: WorkCentreType) => TYPE_LABELS[value],
            },
            { title: 'Capable Processes', dataIndex: 'capabilities_count' },
            {
              title: 'Status',
              dataIndex: 'is_active',
              render: (isActive: boolean) => <StatusTag active={isActive} />,
            },
          ]}
        />
      </Card>
    </div>
  )
}
