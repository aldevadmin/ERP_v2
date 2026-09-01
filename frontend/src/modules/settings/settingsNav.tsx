import type { ReactNode } from 'react'
import {
  ApartmentOutlined,
  AppstoreOutlined,
  BorderOutlined,
  BranchesOutlined,
  ClusterOutlined,
  ColumnWidthOutlined,
  EnvironmentOutlined,
  ExportOutlined,
  FontSizeOutlined,
  GiftOutlined,
  GoldOutlined,
  IdcardOutlined,
  InboxOutlined,
  ShopOutlined,
  SwapOutlined,
  TableOutlined,
  TagsOutlined,
  TeamOutlined,
  ToolOutlined,
  UserOutlined,
} from '@ant-design/icons'

export type SettingsGroupKey = 'masterData' | 'operations' | 'administration'

export interface SettingsNavItem {
  key: string
  label: string
  icon: ReactNode
  // Omitted for a module that isn't built yet — rendered disabled, same as
  // the old vertical Settings landing page's "Not built yet" rows.
  path?: string
}

export interface SettingsGroupConfig {
  key: SettingsGroupKey
  label: string
  items: SettingsNavItem[]
}

// The single source of truth for Settings navigation — both
// `SettingsGroupSelector` (top-level Master Data/Operations/Administration)
// and `SettingsSubNavigation` (the horizontal row of items within a group)
// read from this, so adding a new settings screen only means adding one
// entry here instead of touching multiple nav components.
export const SETTINGS_GROUPS: SettingsGroupConfig[] = [
  {
    key: 'masterData',
    label: 'Master Data',
    items: [
      { key: 'customers', label: 'Customers', icon: <TeamOutlined />, path: '/customers' },
      { key: 'vendors', label: 'Vendors', icon: <ShopOutlined />, path: '/vendors' },
      { key: 'items', label: 'Items', icon: <InboxOutlined />, path: '/items' },
      {
        key: 'product-types',
        label: 'Product Types',
        icon: <AppstoreOutlined />,
        path: '/product-types',
      },
      {
        key: 'material-types',
        label: 'Material Types',
        icon: <GoldOutlined />,
        path: '/material-types',
      },
      { key: 'shapes', label: 'Shapes', icon: <BorderOutlined />, path: '/shapes' },
      {
        key: 'uoms',
        label: 'Units of Measure',
        icon: <ColumnWidthOutlined />,
        path: '/uoms',
      },
      {
        key: 'naming-templates',
        label: 'Naming Templates',
        icon: <FontSizeOutlined />,
        path: '/naming-templates',
      },
      {
        key: 'item-classification',
        label: 'Item Classification',
        icon: <TableOutlined />,
        path: '/item-classification',
      },
      {
        key: 'packaging-profiles',
        label: 'Packaging Profiles',
        icon: <GiftOutlined />,
        path: '/packaging-profiles',
      },
      {
        key: 'customer-product-mappings',
        label: 'Customer Product Mappings',
        icon: <SwapOutlined />,
        path: '/customer-product-mappings',
      },
    ],
  },
  {
    key: 'operations',
    label: 'Operations',
    items: [
      { key: 'processes', label: 'Processes', icon: <ApartmentOutlined />, path: '/processes' },
      {
        key: 'process-categories',
        label: 'Process Categories',
        icon: <TagsOutlined />,
        path: '/process-categories',
      },
      {
        key: 'output-classifications',
        label: 'Output Classifications',
        icon: <ExportOutlined />,
        path: '/output-classifications',
      },
      {
        key: 'product-routes',
        label: 'Product Routes',
        icon: <BranchesOutlined />,
        path: '/product-routes',
      },
      {
        key: 'storage-locations',
        label: 'Storage Locations',
        icon: <EnvironmentOutlined />,
        path: '/storage-locations',
      },
      {
        key: 'work-centres',
        label: 'Work Centres',
        icon: <ClusterOutlined />,
        path: '/work-centres',
      },
      {
        key: 'work-centre-types',
        label: 'Work Centre Types',
        icon: <ClusterOutlined />,
        path: '/work-centre-types',
      },
      { key: 'tooling', label: 'Tooling', icon: <ToolOutlined />, path: '/tooling' },
      {
        key: 'tooling-types',
        label: 'Tooling Types',
        icon: <ToolOutlined />,
        path: '/tooling-types',
      },
    ],
  },
  {
    key: 'administration',
    label: 'Administration',
    items: [
      { key: 'users', label: 'Users', icon: <UserOutlined /> },
      { key: 'roles', label: 'Roles', icon: <IdcardOutlined /> },
    ],
  },
]

/** Resolves the current pathname to the settings group/item it belongs to
 * — used both to pick the active top-level group and to highlight the
 * matching item in the row. Matches not just an item's own path exactly
 * (`/items`) but any sub-route of it too (`/items/new`, `/items/5/edit`,
 * `/customers/5`), since `SettingsLayout` wraps those pages as well — a
 * form nested under Items should still show Items as the active group and
 * item, not fall through to no match at all. The `+ '/'` guard is what
 * keeps this from false-matching a different item that merely shares a
 * prefix, e.g. `/items` must not match `/item-classification`, and
 * `/tooling` must not match `/tooling-types`. */
export function matchSettingsRoute(
  pathname: string,
): { group: SettingsGroupKey; item: SettingsNavItem } | undefined {
  for (const group of SETTINGS_GROUPS) {
    for (const item of group.items) {
      if (!item.path) continue
      if (pathname === item.path || pathname.startsWith(`${item.path}/`)) {
        return { group: group.key, item }
      }
    }
  }
  return undefined
}

export const DEFAULT_SETTINGS_PATH = '/items'

// Where "Settings" in the sidebar (and the bare /settings URL) should send
// you — the last settings page you actually visited, so returning to
// Settings doesn't dump you somewhere you weren't working. Falls back to
// Items, a representative Master Data screen, on a first-ever visit.
const LAST_SETTINGS_PATH_KEY = 'agrileaf-erp:last-settings-path'

export function getLastSettingsPath(): string {
  try {
    return localStorage.getItem(LAST_SETTINGS_PATH_KEY) ?? DEFAULT_SETTINGS_PATH
  } catch {
    // Private-browsing/storage-disabled — fall back rather than break nav.
    return DEFAULT_SETTINGS_PATH
  }
}

export function setLastSettingsPath(pathname: string): void {
  try {
    localStorage.setItem(LAST_SETTINGS_PATH_KEY, pathname)
  } catch {
    // Ignore — this is a convenience default, not required for navigation.
  }
}
