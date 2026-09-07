import type { ReactNode } from 'react'
import { Tabs } from 'antd'
import { useLocation, useNavigate } from 'react-router'

const TABS = [
  { key: 'orders', label: 'Packing Orders', path: '/packing/orders' },
  { key: 'planner', label: 'Weekly Planner', path: '/packing/planner' },
  { key: 'today', label: "Today's Work", path: '/packing/today' },
] as const

/** Shared shell for the Packing module's three top-level pages — per the
 * spec's navigation rule: a single "Packing" area with these three tabs,
 * no separate top-level pages for Transactions/Material
 * Requests/Allocations/Performance (those live inside a Packing Job's own
 * tabs instead). Job Detail and Work Session are deliberately NOT wrapped
 * in this shell — they're full-page drill-ins with their own
 * "← Packing Orders" back-link, not part of the tab switcher.
 */
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
