import { Tooltip, theme } from 'antd'
import { Link } from 'react-router'
import type { SettingsNavItem } from './settingsNav'

const MIN_ITEM_WIDTH = 96

/** The horizontal row of items within one Settings group (Master Data,
 * Operations, or Administration) — shared by all three so there's exactly
 * one place styling this "which master am I on" row. Each item is a card
 * with the icon in a colored badge above a single-line label. Deliberately
 * NOT truncated and NOT fixed-width: labels must stay fully readable (a
 * short one like "Shapes" gets a compact card, a long one like "Customer
 * Product Mappings" gets a wider one) — `white-space: nowrap` with no
 * `overflow`/`text-overflow`/width cap on the label, so every card just
 * sizes to fit its own text. The row itself never wraps either — it
 * overflows into a scroll container instead (see `.settings-subnav-scroll`
 * in index.css for the hidden-but-functional scrollbar), which is exactly
 * why letting cards grow wider here is fine: reading the full label matters
 * more than keeping every card the same width.
 */
export default function SettingsSubNavigation({
  items,
  activeItemPath,
}: {
  items: SettingsNavItem[]
  // Which item's path counts as "current" — resolved by the caller via
  // `matchSettingsRoute`, since a Create/Edit/Detail sub-page (e.g.
  // `/items/new`) should still highlight its parent item (`Items`), not
  // require an exact pathname match.
  activeItemPath: string | undefined
}) {
  const { token } = theme.useToken()

  return (
    <div
      className="settings-subnav-scroll"
      style={{
        background: '#f0f1f3',
        borderRadius: 14,
        padding: 10,
        overflowX: 'auto',
      }}
    >
      <div style={{ display: 'flex', gap: 8, width: 'max-content' }}>
        {items.map((item) => {
          const active = item.path === activeItemPath
          const className = [
            'settings-subnav-item',
            active && 'settings-subnav-item--active',
            !item.path && 'settings-subnav-item--disabled',
          ]
            .filter(Boolean)
            .join(' ')

          const iconColor = !item.path
            ? token.colorTextDisabled
            : active
              ? token.colorPrimary
              : token.colorTextSecondary

          const content = (
            <div
              className={className}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                minWidth: MIN_ITEM_WIDTH,
                padding: '16px 20px',
                borderRadius: 12,
                cursor: item.path ? 'pointer' : 'not-allowed',
                background: token.colorBgContainer,
                border: active ? `1.5px solid ${token.colorPrimary}` : '1.5px solid transparent',
                boxShadow: active
                  ? `0 4px 10px ${token.colorPrimary}26`
                  : '0 1px 2px rgba(0, 0, 0, 0.04)',
                transition: 'border-color 0.15s, box-shadow 0.15s, transform 0.1s',
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 22,
                  color: iconColor,
                  background: active ? `${token.colorPrimary}14` : '#f0f1f3',
                }}
              >
                {item.icon}
              </div>
              <span
                style={{
                  fontSize: 14,
                  fontWeight: active ? 600 : 500,
                  color: !item.path ? token.colorTextDisabled : token.colorText,
                  whiteSpace: 'nowrap',
                  textAlign: 'center',
                }}
              >
                {item.label}
              </span>
            </div>
          )

          if (!item.path) {
            return (
              <Tooltip key={item.key} title="Not built yet">
                {content}
              </Tooltip>
            )
          }

          return (
            <Link key={item.key} to={item.path} style={{ color: 'inherit' }}>
              {content}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
