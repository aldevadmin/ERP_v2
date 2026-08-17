import { Tag } from 'antd'
import type { ExportOrderStatus } from './types'

const STATUS_COLORS: Record<ExportOrderStatus, string> = {
  PLANNING: 'blue',
  FULFILMENT: 'purple',
  PACKING: 'gold',
  LOADING: 'orange',
  SHIPPED: 'cyan',
  COMPLETE: 'success',
  CANCELLED: 'error',
}

const STATUS_LABELS: Record<ExportOrderStatus, string> = {
  PLANNING: 'Planning',
  FULFILMENT: 'Fulfilment',
  PACKING: 'Packing',
  LOADING: 'Loading',
  SHIPPED: 'Shipping',
  COMPLETE: 'Complete',
  CANCELLED: 'Cancelled',
}

export default function ExportOrderStatusTag({ status }: { status: ExportOrderStatus }) {
  return <Tag color={STATUS_COLORS[status]}>{STATUS_LABELS[status]}</Tag>
}
