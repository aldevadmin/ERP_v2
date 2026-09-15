import type { ReactNode } from 'react'
import { Tabs } from 'antd'
import { useLocation, useNavigate } from 'react-router'

const TABS = [
  { key: 'orders', label: 'All Orders', path: '/packing/orders' },
  { key: 'today', label: "Today's Work", path: '/packing/today' },
  { key: 'transactions', label: 'Transactions', path: '/packing/transactions' },
] as const

/** Shared shell for the fresh Packing rebuild's top-level pages — same
 * tab-bar pattern as `modules/packing-advanced/PackingLayout`. */
export default function PackingLayout({ children }: { children: ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const activeKey = TABS.find((tab) => location.pathname.startsWith(tab.path))?.key ?? 'orders'

  return (
    <div>
      <Tabs
        activeKey={activeKey}
        onChange={(key) => {
          const tab = TABS.find((t) => t.key === key)
          if (tab) navigate(tab.path)
        }}
        items={TABS.map((tab) => ({ key: tab.key, label: tab.label }))}
      />
      {children}
    </div>
  )
}
