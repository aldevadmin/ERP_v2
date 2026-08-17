import { Tag } from 'antd'
import type { SkuRiskStatus } from './types'

const RISK_COLORS: Record<SkuRiskStatus, string> = {
  ON_TRACK: 'success',
  AT_RISK: 'gold',
  DELAYED: 'error',
}

const RISK_LABELS: Record<SkuRiskStatus, string> = {
  ON_TRACK: 'On Track',
  AT_RISK: 'At Risk',
  DELAYED: 'Delayed',
}

export default function SkuRiskTag({ risk }: { risk: SkuRiskStatus }) {
  return <Tag color={RISK_COLORS[risk]}>{RISK_LABELS[risk]}</Tag>
}
