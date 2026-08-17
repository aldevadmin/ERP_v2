import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import {
  Breadcrumb,
  Button,
  Dropdown,
  Empty,
  Flex,
  Modal,
  Space,
  Spin,
  Tabs,
  Typography,
  message,
} from 'antd'
import {
  CalendarOutlined,
  CheckCircleOutlined,
  DownloadOutlined,
  EditOutlined,
  InboxOutlined,
  MoreOutlined,
} from '@ant-design/icons'
import SectionCard from '../../shared/components/SectionCard'
import ExportOrderStatusTag from './ExportOrderStatusTag'
import ExportOrderFulfilmentTab from './ExportOrderFulfilmentTab'
import ExportOrderLinesTab from './ExportOrderLinesTab'
import ExportOrderLoadingTab from './ExportOrderLoadingTab'
import ExportOrderOverviewTab from './ExportOrderOverviewTab'
import ExportOrderPackingTab from './ExportOrderPackingTab'
import ExportOrderPlanningTab from './ExportOrderPlanningTab'
import ExportOrderPlanningV2Tab from './ExportOrderPlanningV2Tab'
import ExportOrderShippingTab from './ExportOrderShippingTab'
import { advanceExportOrder, cancelExportOrder, getExportOrder } from './api'
import type { ExportOrder } from './types'

const { Title, Text } = Typography

function DetailField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
        {label}
      </Text>
      <Text strong>{value}</Text>
    </div>
  )
}

export default function ExportOrderDetailPage() {
  const { id, tab } = useParams<{ id: string; tab?: string }>()
  const navigate = useNavigate()
  const [order, setOrder] = useState<ExportOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [cancelling, setCancelling] = useState(false)
  const [advancing, setAdvancing] = useState(false)
  // Local state drives which tab is shown; the URL is a side effect of it
  // (kept in sync on change, and used only to seed the initial tab on
  // load) rather than the single source of truth — a fully URL-controlled
  // Tabs component would never visually switch if `navigate` didn't
  // actually update the route (e.g. in tests, or a slow history update).
  const [activeTab, setActiveTab] = useState(tab || 'overview')

  const load = () => {
    if (!id) return
    setLoading(true)
    getExportOrder(Number(id))
      .then(setOrder)
      .catch(() => setOrder(null))
      .finally(() => setLoading(false))
  }

  useEffect(load, [id])

  const handleCancel = async () => {
    if (!order) return
    setCancelling(true)
    try {
      setOrder(await cancelExportOrder(order.id))
      message.success('Order cancelled.')
    } finally {
      setCancelling(false)
    }
  }

  const handleAdvance = async (successMessage = 'Order advanced to the next stage.') => {
    if (!order) return
    setAdvancing(true)
    try {
      setOrder(await advanceExportOrder(order.id))
      message.success(successMessage)
    } finally {
      setAdvancing(false)
    }
  }

  if (loading) {
    return (
      <Flex justify="center" style={{ paddingTop: 48 }}>
        <Spin size="large" />
      </Flex>
    )
  }

  if (!order) {
    return <Empty description="Export order not found" style={{ paddingTop: 48 }} />
  }

  const canAdvance = order.status !== 'CANCELLED' && order.status !== 'COMPLETE'

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 12 }}
        items={[
          { title: <Link to="/export-orders">Export Orders</Link> },
          { title: order.order_number },
        ]}
      />

      <Flex justify="space-between" align="flex-start" style={{ marginBottom: 16 }}>
        <div>
          <Space align="center">
            <Title level={3} style={{ margin: 0 }}>
              {order.order_number}
            </Title>
            <ExportOrderStatusTag status={order.status} />
          </Space>
          <Space size="large" style={{ marginTop: 4 }}>
            <Text type="secondary">
              <CalendarOutlined /> CRD: {order.planned_container_ready_date ?? '—'}
            </Text>
            <Text type="secondary">
              <InboxOutlined /> Container: {order.container_type ?? '—'}
            </Text>
          </Space>
        </div>
        <Space>
          {activeTab === 'loading' ? (
            <>
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                disabled={order.status !== 'LOADING'}
                loading={advancing}
                onClick={() => void handleAdvance('Marked as loaded — order advanced to Shipping.')}
              >
                Mark as Loaded
              </Button>
              <Button
                icon={<DownloadOutlined />}
                onClick={() => message.info("Export Loading Sheet isn't available yet.")}
              >
                Export Loading Sheet
              </Button>
            </>
          ) : (
            <Button
              type="primary"
              icon={<EditOutlined />}
              onClick={() => navigate(`/export-orders/${order.id}/edit`)}
            >
              Edit Order
            </Button>
          )}
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                ...(canAdvance ? [{ key: 'advance', label: 'Advance to Next Stage' }] : []),
                ...(order.status !== 'CANCELLED'
                  ? [{ key: 'cancel', label: 'Cancel Order', danger: true }]
                  : []),
              ],
              onClick: ({ key }) => {
                if (key === 'advance') void handleAdvance()
                if (key === 'cancel') {
                  Modal.confirm({
                    title: 'Cancel this export order?',
                    okText: 'Cancel Order',
                    okButtonProps: { danger: true },
                    cancelText: 'Back',
                    onOk: handleCancel,
                  })
                }
              },
            }}
          >
            <Button
              icon={<MoreOutlined />}
              aria-label="Order actions"
              loading={cancelling || advancing}
            />
          </Dropdown>
        </Space>
      </Flex>

      <SectionCard>
        <Flex justify="space-between" wrap="wrap" gap={20} style={{ marginBottom: 20 }}>
          <DetailField label="Customer" value={order.customer_name} />
          <DetailField label="PO No." value={order.customer_po_number} />
          <DetailField label="Order Date" value={order.customer_po_date} />
          <DetailField
            label="CRD"
            value={
              <Text strong style={{ color: '#d97706' }}>
                {order.planned_container_ready_date ?? '—'}
              </Text>
            }
          />
          <DetailField label="Container" value={order.container_type ?? '—'} />
          <DetailField label="Stage" value={<ExportOrderStatusTag status={order.status} />} />
        </Flex>

        <Tabs
          activeKey={activeTab}
          onChange={(key) => {
            setActiveTab(key)
            navigate(`/export-orders/${order.id}/${key}`, { replace: true })
          }}
          items={[
            {
              key: 'overview',
              label: 'Overview',
              children: <ExportOrderOverviewTab order={order} onOrderUpdate={setOrder} />,
            },
            {
              key: 'lines',
              label: 'Order Lines',
              children: <ExportOrderLinesTab exportOrderId={order.id} customerId={order.customer} />,
            },
            {
              key: 'planning',
              label: 'Planning',
              children: <ExportOrderPlanningTab exportOrderId={order.id} />,
            },
            {
              key: 'planning-v2',
              label: 'Planning v2',
              children: <ExportOrderPlanningV2Tab exportOrderId={order.id} />,
            },
            {
              key: 'fulfilment',
              label: 'Fulfilment',
              children: <ExportOrderFulfilmentTab exportOrderId={order.id} />,
            },
            {
              key: 'packing',
              label: 'Packing',
              children: <ExportOrderPackingTab exportOrderId={order.id} />,
            },
            {
              key: 'loading',
              label: 'Loading',
              children: <ExportOrderLoadingTab exportOrderId={order.id} />,
            },
            {
              key: 'shipping',
              label: 'Shipping',
              children: <ExportOrderShippingTab exportOrderId={order.id} />,
            },
          ]}
        />
      </SectionCard>
    </div>
  )
}
