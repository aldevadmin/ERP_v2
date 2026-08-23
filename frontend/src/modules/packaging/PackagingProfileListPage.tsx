import { useCallback, useEffect, useState } from 'react'
import { Breadcrumb, Button, Card, Flex, Input, Popconfirm, Select, Table, Tag, Typography, message } from 'antd'
import { DeleteOutlined } from '@ant-design/icons'
import { Link, useNavigate } from 'react-router'
import { ApiError } from '../../shared/api/http'
import { deletePackagingProfile, listPackagingProfiles } from './api'
import { PACKAGING_PROFILE_SCOPE_OPTIONS } from './types'
import type { PackagingProfile, PackagingVersionStatus } from './types'

const { Title } = Typography

const STATUS_COLORS: Record<PackagingVersionStatus, string> = {
  DRAFT: 'default',
  PUBLISHED: 'green',
  RETIRED: 'orange',
}

export default function PackagingProfileListPage() {
  const navigate = useNavigate()
  const [profiles, setProfiles] = useState<PackagingProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [scope, setScope] = useState<string | undefined>(undefined)
  const [statusFilter, setStatusFilter] = useState<'true' | 'false' | undefined>('true')

  const load = useCallback(() => {
    setLoading(true)
    listPackagingProfiles({
      search: search || undefined,
      scope,
      isActive: statusFilter === undefined ? undefined : statusFilter === 'true',
    })
      .then((response) => setProfiles(response.results))
      .finally(() => setLoading(false))
  }, [search, scope, statusFilter])

  useEffect(() => {
    load()
  }, [load])

  const handleDelete = async (profile: PackagingProfile) => {
    try {
      await deletePackagingProfile(profile.id)
      message.success('Packaging profile deleted.')
      load()
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : 'Could not delete this profile.')
    }
  }

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 12 }}
        items={[{ title: <Link to="/settings">Settings</Link> }, { title: 'Packaging Profiles' }]}
      />
      <Card
        title={
          <Title level={4} style={{ margin: 0 }}>
            Packaging Profiles
          </Title>
        }
        extra={
          <Button type="primary" onClick={() => navigate('/packaging-profiles/new')}>
            Create Profile
          </Button>
        }
      >
        <Typography.Paragraph type="secondary">
          Reusable packing configurations — pieces per pouch/carton, dimensions, weights — for a finished item.
        </Typography.Paragraph>
        <Flex justify="space-between" style={{ marginBottom: 16 }} wrap="wrap" gap={12}>
          <Input.Search
            placeholder="Search profiles..."
            allowClear
            style={{ maxWidth: 320 }}
            onSearch={setSearch}
          />
          <Flex gap={12} wrap="wrap">
            <Select
              aria-label="Scope"
              placeholder="Scope"
              allowClear
              style={{ width: 180 }}
              value={scope}
              onChange={setScope}
              options={PACKAGING_PROFILE_SCOPE_OPTIONS}
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
        <Table<PackagingProfile>
          rowKey="id"
          loading={loading}
          dataSource={profiles}
          onRow={(record) => ({
            onClick: () => navigate(`/packaging-profiles/${record.id}/edit`),
            style: { cursor: 'pointer' },
          })}
          columns={[
            { title: 'Code', dataIndex: 'code' },
            { title: 'Name', dataIndex: 'name' },
            { title: 'Finished Item', dataIndex: 'finished_item_name' },
            {
              title: 'Version',
              key: 'version',
              render: (_, record) =>
                record.current_version ? (
                  <Tag color={STATUS_COLORS[record.current_version.status]}>
                    v{record.current_version.version_number} — {record.current_version.status}
                  </Tag>
                ) : (
                  '—'
                ),
            },
            {
              title: '',
              key: 'actions',
              width: 48,
              render: (_, record) => (
                <Popconfirm
                  title="Delete this profile?"
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
