import { Empty } from 'antd'
import SectionCard from '../../shared/components/SectionCard'

export default function InventoryPage() {
  return (
    <SectionCard title="Inventory">
      <Empty description="Inventory isn't built yet." style={{ paddingTop: 48 }} />
    </SectionCard>
  )
}
