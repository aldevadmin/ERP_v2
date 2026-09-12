import type { ReactNode } from 'react'
import { Tabs } from 'antd'
import { useLocation, useNavigate } from 'react-router'

const TABS = [
  { key: 'execution', label: 'Execution', path: '/packing/settings/execution' },
  { key: 'recording-schedule', label: 'Recording Schedule', path: '/packing/settings/recording-schedule' },
] as const

/** Sub-nav for the two Packing-specific configuration screens, reached via
 * the "Settings" entry under Packing in the left-hand app sidebar rather
 * than the generic Settings area — these govern how the Packing floor's
 * recording engine behaves, not shared master data, so they live with the
 * module they configure instead of alongside Bays/Shifts/Work Centres etc. */
export default function PackingSettingsLayout({ children }: { children: ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const activeKey = TABS.find((tab) => location.pathname.startsWith(tab.path))?.key ?? 'execution'

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
