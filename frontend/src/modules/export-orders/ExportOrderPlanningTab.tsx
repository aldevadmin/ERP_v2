import { useState } from 'react'
import { Tabs } from 'antd'
import ExportOrderPackingMaterialsTab from './ExportOrderPackingMaterialsTab'
import ExportOrderSkuPlanningTab from './ExportOrderSkuPlanningTab'
import { PACKING_MATERIAL_TABS } from './types'

export default function ExportOrderPlanningTab({ exportOrderId }: { exportOrderId: number }) {
  const [activeSubTab, setActiveSubTab] = useState('sku-planning')

  return (
    <Tabs
      activeKey={activeSubTab}
      onChange={setActiveSubTab}
      items={[
        {
          key: 'sku-planning',
          label: 'SKU Planning',
          children: <ExportOrderSkuPlanningTab exportOrderId={exportOrderId} />,
        },
        ...PACKING_MATERIAL_TABS.map(({ key, label }) => ({
          key: key.toLowerCase().replace(/_/g, '-'),
          label,
          children: (
            <ExportOrderPackingMaterialsTab
              exportOrderId={exportOrderId}
              materialType={key}
              title={label}
            />
          ),
        })),
      ]}
    />
  )
}
