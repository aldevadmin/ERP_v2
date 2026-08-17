import { Space, Tag } from 'antd'
import ProgressStepper from '../../shared/components/ProgressStepper'
import type { ExportOrderStatus } from './types'

const STEPS = ['Planning', 'Fulfilment', 'Packing', 'Loading', 'Shipping']

const STEP_INDEX: Record<Exclude<ExportOrderStatus, 'CANCELLED'>, number> = {
  PLANNING: 0,
  FULFILMENT: 1,
  PACKING: 2,
  LOADING: 3,
  SHIPPED: 4,
  COMPLETE: 4,
}

export default function ExportOrderProgressStepper({ status }: { status: ExportOrderStatus }) {
  if (status === 'CANCELLED') {
    return (
      <Space>
        <ProgressStepper steps={STEPS} currentIndex={0} failed />
        <Tag color="error">Cancelled</Tag>
      </Space>
    )
  }

  return <ProgressStepper steps={STEPS} currentIndex={STEP_INDEX[status]} />
}
