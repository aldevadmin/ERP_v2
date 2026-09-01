import { useEffect, useState, type ReactNode } from 'react'
import { Flex, Typography } from 'antd'
import { useLocation, useNavigate } from 'react-router'
import SettingsGroupSelector from './SettingsGroupSelector'
import SettingsSubNavigation from './SettingsSubNavigation'
import { SETTINGS_GROUPS, matchSettingsRoute, setLastSettingsPath } from './settingsNav'
import type { SettingsGroupKey } from './settingsNav'

const { Title } = Typography

/** Shared shell for every Settings screen — the horizontal Master
 * Data/Operations/Administration switcher plus the row of items within
 * whichever group is active, sitting above the page's own content
 * (unchanged). Wrap a route's element in this rather than restructuring
 * routing: every settings screen keeps its existing URL
 * (`/customers`, `/items`, ...), so bookmarks, tests, and links elsewhere
 * in the app that already point at those paths keep working. This
 * includes each master's Create/Edit/Detail pages, not just its list —
 * `matchSettingsRoute` resolves `/items/new` or `/customers/5` to the same
 * group/item as `/items` or `/customers`, so the nav bar (and the ability
 * to jump straight to a different master) stays available everywhere, not
 * just on list screens.
 *
 * The active group is normally derived from the URL so refresh/back/forward
 * all land on the right group automatically. Administration is the one
 * exception — its items (Users, Roles) aren't built yet, so there's no
 * route to send you to; clicking that segment is tracked in local state
 * purely to preview its (disabled) row, without changing the URL or the
 * page content underneath.
 */
export default function SettingsLayout({ children }: { children: ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const match = matchSettingsRoute(location.pathname)
  const [manualGroup, setManualGroup] = useState<SettingsGroupKey | null>(null)

  // A manual Administration peek wins while it's active, but only until
  // real navigation happens — the effect below clears it as soon as the
  // route (and therefore the match) actually changes, so e.g. clicking a
  // sidebar link elsewhere and coming back resets it.
  const activeGroup = manualGroup ?? match?.group ?? 'masterData'

  useEffect(() => {
    // Recomputed from `location.pathname` here rather than closing over
    // the outer `match` — `match` is a fresh object every render, so
    // depending on it would fire this effect on every render (including
    // the one caused by `setManualGroup` itself), immediately stomping the
    // Administration peek back to null.
    if (matchSettingsRoute(location.pathname)) {
      setLastSettingsPath(location.pathname)
      setManualGroup(null)
    }
  }, [location.pathname])

  const group = SETTINGS_GROUPS.find((g) => g.key === activeGroup) ?? SETTINGS_GROUPS[0]

  // Switching the top-level group jumps straight to its first real item
  // (e.g. Master Data -> Operations lands on Processes) rather than just
  // relabeling the row and leaving you on an unrelated page — one click
  // gets you somewhere, not two. Administration has nothing built to jump
  // to yet, so it falls back to a local-only row preview.
  function handleGroupChange(key: SettingsGroupKey) {
    const firstPath = SETTINGS_GROUPS.find((g) => g.key === key)?.items.find(
      (item) => item.path,
    )?.path
    if (firstPath) {
      navigate(firstPath)
    } else {
      setManualGroup(key)
    }
  }

  return (
    <div>
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #f0f0f0',
          borderRadius: 12,
          padding: '20px 24px',
          marginBottom: 20,
        }}
      >
        <Flex vertical gap={16}>
          <Title level={4} style={{ margin: 0 }}>
            Settings
          </Title>
          <SettingsGroupSelector value={activeGroup} onChange={handleGroupChange} />
          <SettingsSubNavigation items={group.items} activeItemPath={match?.item.path} />
        </Flex>
      </div>
      {children}
    </div>
  )
}
