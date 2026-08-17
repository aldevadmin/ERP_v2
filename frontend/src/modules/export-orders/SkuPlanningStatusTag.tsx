import { Tag } from 'antd'
import type { SkuPlanningStatus } from './types'

const STATUS_COLORS: Record<SkuPlanningStatus, string> = {
  NOT_STARTED: 'default',
  IN_PROGRESS: 'blue',
  READY: 'success',
  DELAYED: 'error',
}

const STATUS_LABELS: Record<SkuPlanningStatus, string> = {
  NOT_STARTED: 'Not Started',
  IN_PROGRESS: 'In Progress',
  READY: 'Ready',
  DELAYED: 'Delayed',
}

export default function SkuPlanningStatusTag({ status }: { status: SkuPlanningStatus }) {
  return <Tag color={STATUS_COLORS[status]}>{STATUS_LABELS[status]}</Tag>
}
