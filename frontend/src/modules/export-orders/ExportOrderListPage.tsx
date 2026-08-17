import { useCallback, useEffect, useState } from 'react'
import {
  Button,
  DatePicker,
  Dropdown,
  Flex,
  Input,
  Modal,
  Select,
  Table,
  Typography,
  message,
} from 'antd'
import { MoreOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import type { Dayjs } from 'dayjs'
import { useNavigate } from 'react-router'
import SectionCard from '../../shared/components/SectionCard'
import ExportOrderProgressStepper from './ExportOrderProgressStepper'
import ExportOrderStatusTag from './ExportOrderStatusTag'
import NewExportOrderModal from './NewExportOrderModal'
import { cancelExportOrder, listExportOrders } from './api'
import { listCustomers } from '../customers/api'
import type { CustomerListItem } from '../customers/types'
import type { ExportOrderListItem, ExportOrderStatus } from './types'

const { Title, Text } = Typography

const STATUS_OPTIONS: { value: ExportOrderStatus; label: string }[] = [
  { value: 'PLANNING', label: 'Planning' },
  { value: 'FULFILMENT', label: 'Fulfilment' },
  { value: 'PACKING', label: 'Packing' },
  { value: 'LOADING', label: 'Loading' },
  { value: 'SHIPPED', label: 'Shipping' },
  { value: 'COMPLETE', label: 'Complete' },
  { value: 'CANCELLED', label: 'Cancelled' },
]

const PAGE_SIZE = 20

interface Filters {
  search?: string
  status?: ExportOrderStatus
  customer?: number
  crdFrom?: string
  crdTo?: string
}

export default function ExportOrderListPage() {
  const navigate = useNavigate()
  const [orders, setOrders] = useState<ExportOrderListItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [customers, setCustomers] = useState<CustomerListItem[]>([])
  const [modalOpen, setModalOpen] = useState(false)

  // Draft inputs — only applied to `filters` (and re-fetched) on "Filter",
  // so five fields don't each fire their own request while typing.
  const [searchDraft, setSearchDraft] = useState('')
  const [customerDraft, setCustomerDraft] = useState<number | undefined>(undefined)
  const [statusDraft, setStatusDraft] = useState<ExportOrderStatus | undefined>(undefined)
  const [crdFromDraft, setCrdFromDraft] = useState<Dayjs | null>(null)
  const [crdToDraft, setCrdToDraft] = useState<Dayjs | null>(null)

  const [filters, setFilters] = useState<Filters>({})

  useEffect(() => {
    listCustomers({ isActive: true }).then((response) => setCustomers(response.results))
  }, [])

  const load = useCallback(() => {
    setLoading(true)
    listExportOrders({ ...filters, page })
      .then((response) => {
        setOrders(response.results)
        setTotal(response.count)
      })
      .finally(() => setLoading(false))
  }, [filters, page])

  useEffect(() => {
    load()
  }, [load])

  const applyFilters = () => {
    setPage(1)
    setFilters({
      search: searchDraft || undefined,
      status: statusDraft,
      customer: customerDraft,
      crdFrom: crdFromDraft ? crdFromDraft.format('YYYY-MM-DD') : undefined,
      crdTo: crdToDraft ? crdToDraft.format('YYYY-MM-DD') : undefined,
    })
  }

  const resetFilters = () => {
    setSearchDraft('')
    setCustomerDraft(undefined)
    setStatusDraft(undefined)
    setCrdFromDraft(null)
    setCrdToDraft(null)
    setPage(1)
    setFilters({})
  }

  const handleCancel = (order: ExportOrderListItem) => {
    Modal.confirm({
      title: `Cancel ${order.order_number}?`,
      okText: 'Cancel Order',
      okButtonProps: { danger: true },
      cancelText: 'Back',
      onOk: async () => {
        await cancelExportOrder(order.id)
        message.success('Order cancelled.')
        load()
      },
    })
  }

  return (
    <div>
      <Flex justify="space-between" align="flex-start" style={{ marginBottom: 20 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            Export Orders
          </Title>
          <Text type="secondary">Manage all export orders from one place.</Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
          New Order
        </Button>
      </Flex>

      <SectionCard>
        <Flex gap={12} wrap="wrap" align="flex-end" style={{ marginBottom: 20 }}>
          <div style={{ flex: '1 1 260px', minWidth: 220 }}>
            <div style={{ marginBottom: 4 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Search
              </Text>
            </div>
            <Input
              placeholder="Search by order no., customer, PO no."
              allowClear
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              onPressEnter={applyFilters}
            />
          </div>
          <div style={{ width: 180 }}>
            <div style={{ marginBottom: 4 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Customer
              </Text>
            </div>
            <Select
              placeholder="All Customers"
              allowClear
              style={{ width: '100%' }}
              value={customerDraft}
              onChange={setCustomerDraft}
              showSearch
              optionFilterProp="label"
              options={customers.map((c) => ({ value: c.id, label: c.name }))}
            />
          </div>
          <div style={{ width: 160 }}>
            <div style={{ marginBottom: 4 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Status
              </Text>
            </div>
            <Select
              placeholder="All Statuses"
              allowClear
              style={{ width: '100%' }}
              value={statusDraft}
              onChange={setStatusDraft}
              options={STATUS_OPTIONS}
            />
          </div>
          <div style={{ width: 160 }}>
            <div style={{ marginBottom: 4 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                CRD From
              </Text>
            </div>
            <DatePicker
              style={{ width: '100%' }}
              format="YYYY-MM-DD"
              value={crdFromDraft}
              onChange={setCrdFromDraft}
            />
          </div>
          <div style={{ width: 160 }}>
            <div style={{ marginBottom: 4 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                CRD To
              </Text>
            </div>
            <DatePicker
              style={{ width: '100%' }}
              format="YYYY-MM-DD"
              value={crdToDraft}
              onChange={setCrdToDraft}
            />
          </div>
          <Button type="primary" onClick={applyFilters}>
            Filter
          </Button>
          <Button icon={<ReloadOutlined />} onClick={resetFilters}>
            Reset
          </Button>
        </Flex>

        <Table<ExportOrderListItem>
          rowKey="id"
          loading={loading}
          dataSource={orders}
          onRow={(record) => ({
            onClick: () => navigate(`/export-orders/${record.id}`),
            style: { cursor: 'pointer' },
          })}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total,
            onChange: setPage,
            showTotal: (t, range) => `Showing ${range[0]} to ${range[1]} of ${t} orders`,
          }}
          columns={[
            { title: 'Order No.', dataIndex: 'order_number' },
            { title: 'Customer', dataIndex: 'customer_name' },
            { title: 'PO No.', dataIndex: 'customer_po_number' },
            { title: 'Order Date', dataIndex: 'customer_po_date' },
            {
              title: 'CRD',
              dataIndex: 'planned_container_ready_date',
              render: (v: string | null) =>
                v ? <Text style={{ color: '#d97706' }}>{v}</Text> : '—',
            },
            {
              title: 'Status',
              dataIndex: 'status',
              render: (value: ExportOrderStatus) => <ExportOrderProgressStepper status={value} />,
            },
            {
              title: 'Container',
              dataIndex: 'container_type',
              render: (v: string | null) => v || '—',
            },
            {
              title: 'Stage',
              dataIndex: 'status',
              render: (value: ExportOrderStatus) => <ExportOrderStatusTag status={value} />,
            },
            {
              title: '',
              key: 'actions',
              render: (_, record) => (
                <Dropdown
                  trigger={['click']}
                  menu={{
                    items: [
                      { key: 'view', label: 'View' },
                      { key: 'edit', label: 'Edit' },
                      ...(record.status !== 'CANCELLED'
                        ? [{ key: 'cancel', label: 'Cancel Order', danger: true }]
                        : []),
                    ],
                    onClick: ({ key, domEvent }) => {
                      domEvent.stopPropagation()
                      if (key === 'view') navigate(`/export-orders/${record.id}`)
                      if (key === 'edit') navigate(`/export-orders/${record.id}/edit`)
                      if (key === 'cancel') handleCancel(record)
                    },
                  }}
                >
                  <Button
                    type="text"
                    icon={<MoreOutlined />}
                    aria-label={`Actions — ${record.order_number}`}
                    onClick={(e) => e.stopPropagation()}
                  />
                </Dropdown>
              ),
            },
          ]}
        />
      </SectionCard>

      <NewExportOrderModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={(order) => {
          setModalOpen(false)
          navigate(`/export-orders/${order.id}`)
        }}
      />
    </div>
  )
}
