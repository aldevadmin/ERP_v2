import { useCallback, useEffect, useState } from 'react'
import { Breadcrumb, Input, Table, Typography } from 'antd'
import { Link } from 'react-router'
import SectionCard from '../../shared/components/SectionCard'
import StatusTag from '../../shared/components/StatusTag'
import { listVendors } from './api'
import type { Vendor } from './types'

const { Title } = Typography

export default function VendorListPage() {
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    listVendors({ search: search || undefined })
      .then((response) => setVendors(response.results))
      .finally(() => setLoading(false))
  }, [search])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 12 }}
        items={[{ title: <Link to="/settings">Settings</Link> }, { title: 'Vendors' }]}
      />
      <SectionCard
        title={
          <Title level={4} style={{ margin: 0 }}>
            Vendors
          </Title>
        }
      >
        <Input.Search
          placeholder="Search by code or name"
          allowClear
          style={{ maxWidth: 320, marginBottom: 16 }}
          onSearch={setSearch}
        />
        <Table<Vendor>
          rowKey="id"
          loading={loading}
          dataSource={vendors}
          columns={[
            { title: 'Code', dataIndex: 'code' },
            { title: 'Name', dataIndex: 'name' },
            { title: 'Category', dataIndex: 'category', render: (v: string) => v || '—' },
            {
              title: 'Status',
              dataIndex: 'is_active',
              render: (isActive: boolean) => <StatusTag active={isActive} />,
            },
          ]}
        />
      </SectionCard>
    </div>
  )
}
