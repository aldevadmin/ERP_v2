import { Tag } from 'antd'
import type { SkuRiskStatus } from './types'

export type FulfilmentReadinessStatus = SkuRiskStatus | 'COMPLETE'

const COLORS: Record<FulfilmentReadinessStatus, string> = {
  ON_TRACK: 'success',
  AT_RISK: 'gold',
  DELAYED: 'error',
  COMPLETE: 'success',
}

const LABELS: Record<FulfilmentReadinessStatus, string> = {
  ON_TRACK: 'On Track',
  AT_RISK: 'At Risk',
  DELAYED: 'Delayed',
  COMPLETE: 'Complete',
}

export default function FulfilmentStatusTag({ status }: { status: FulfilmentReadinessStatus }) {
  return <Tag color={COLORS[status]}>{LABELS[status]}</Tag>
}
