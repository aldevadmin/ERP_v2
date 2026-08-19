import { Empty } from 'antd'
import SectionCard from '../../shared/components/SectionCard'

export default function ProductionPage() {
  return (
    <SectionCard title="Production">
      <Empty description="Production isn't built yet." style={{ paddingTop: 48 }} />
    </SectionCard>
  )
}
