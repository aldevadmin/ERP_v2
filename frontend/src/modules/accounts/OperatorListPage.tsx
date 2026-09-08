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
import { deleteEmployee, listEmployees } from './api'
import type { Employee } from './types'

const { Title } = Typography

export default function OperatorListPage() {
  const navigate = useNavigate()
  const [operators, setOperators] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeOnly, setActiveOnly] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    listEmployees({ search: search || undefined, isActive: activeOnly ? true : undefined })
      .then((response) => setOperators(response.results))
      .finally(() => setLoading(false))
  }, [search, activeOnly])

  useEffect(() => {
    load()
  }, [load])

  const handleDelete = async (operator: Employee) => {
    try {
      await deleteEmployee(operator.id)
      message.success('Operator deleted.')
      load()
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : 'Could not delete this operator.')
    }
  }

  return (
    <div>
      <Card
        title={
          <Title level={4} style={{ margin: 0 }}>
            Operators
          </Title>
        }
        extra={
          <Button type="primary" onClick={() => navigate('/operators/new')}>
            New Operator
          </Button>
        }
      >
        <Typography.Paragraph type="secondary">
          The floor staff selectable as Work Centre operators — in Shift Setup, packing entries,
          and elsewhere a person needs to be picked. Operators don't need a login of their own;
          add a User separately only for someone who needs to sign into the system directly.
        </Typography.Paragraph>
        <Flex justify="space-between" style={{ marginBottom: 16 }} wrap="wrap" gap={12}>
          <Input.Search
            placeholder="Search by name or code"
            allowClear
            style={{ maxWidth: 320 }}
            onSearch={setSearch}
          />
          <Space>
            <span>Active only</span>
            <Switch checked={activeOnly} onChange={setActiveOnly} />
          </Space>
        </Flex>
        <Table<Employee>
          rowKey="id"
          loading={loading}
          dataSource={operators}
          onRow={(record) => ({
            onClick: () => navigate(`/operators/${record.id}/edit`),
            style: { cursor: 'pointer' },
          })}
          columns={[
            { title: 'Code', dataIndex: 'employee_code', width: 140 },
            { title: 'Name', dataIndex: 'full_name' },
            { title: 'Team', dataIndex: 'team_name', render: (v: string | null) => v || '—' },
            {
              title: 'Designation',
              dataIndex: 'designation',
              render: (v: string) => v || '—',
            },
            {
              title: 'Status',
              dataIndex: 'is_active',
              width: 120,
              render: (isActive: boolean) => <StatusTag active={isActive} />,
            },
            {
              title: '',
              key: 'actions',
              width: 48,
              render: (_, record) => (
                <Popconfirm
                  title="Delete this operator?"
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
                    aria-label={`Delete ${record.full_name}`}
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
