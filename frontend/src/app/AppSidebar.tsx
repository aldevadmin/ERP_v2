import { useState, type ReactNode } from 'react'
import { Avatar, Dropdown, Layout, Menu, Space, Typography } from 'antd'
import {
  DashboardOutlined,
  DatabaseOutlined,
  DeploymentUnitOutlined,
  FileTextOutlined,
  InboxOutlined,
  LogoutOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { Link, useLocation } from 'react-router'
import { useAuth } from '../shared/auth/AuthContext'

const { Sider } = Layout
const { Text } = Typography

type NavItem = { key: string; icon: ReactNode; label: ReactNode } | { type: 'divider' }

const NAV_ITEMS: NavItem[] = [
  { key: '/', icon: <DashboardOutlined />, label: <Link to="/">Dashboard</Link> },
  {
    key: '/export-orders',
    icon: <FileTextOutlined />,
    label: <Link to="/export-orders">Export Orders</Link>,
  },
  {
    key: '/production',
    icon: <DeploymentUnitOutlined />,
    label: <Link to="/production">Production</Link>,
  },
  { key: '/packing', icon: <InboxOutlined />, label: <Link to="/packing">Packing</Link> },
  { key: '/inventory', icon: <DatabaseOutlined />, label: <Link to="/inventory">Inventory</Link> },
  { type: 'divider' },
  { key: '/settings', icon: <SettingOutlined />, label: <Link to="/settings">Settings</Link> },
]

function selectedKeyFor(pathname: string): string {
  if (pathname === '/') return '/'
  const match = NAV_ITEMS.filter(
    (item): item is Extract<NavItem, { key: string }> =>
      'key' in item && item.key !== '/' && pathname.startsWith(item.key),
  )
  // Every page that isn't one of the other top-level sections above is
  // reached by drilling into Settings (master data, operations config) —
  // highlight Settings rather than falling back to Dashboard.
  return match[0]?.key ?? '/settings'
}

function LeafLogo() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20 4C10 4 4 10 4 19c0 .55.45 1 1 1 9 0 15-6 15-16 0-.55-.45-1-1-1Z"
        fill="#16a34a"
      />
      <path d="M5 19C10 14 14 10 19 5" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

export default function AppSidebar() {
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const { state, logout } = useAuth()
  const user = state.user

  const displayName = user?.employee?.full_name ?? user?.username ?? ''
  const primaryRole = user?.roles?.[0] ?? ''
  const initial = displayName.charAt(0).toUpperCase() || 'A'

  return (
    <Sider
      collapsible
      collapsed={collapsed}
      onCollapse={setCollapsed}
      breakpoint="lg"
      theme="light"
      style={{
        borderRight: '1px solid #f0f0f0',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        position: 'sticky',
        top: 0,
      }}
    >
      <div
        style={{
          height: 56,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          justifyContent: collapsed ? 'center' : 'flex-start',
          paddingInline: collapsed ? 0 : 20,
          fontWeight: 700,
          fontSize: 16,
          color: '#16a34a',
          letterSpacing: 0.5,
        }}
      >
        <LeafLogo />
        {!collapsed && 'AGRILEAF ERP'}
      </div>
      <Menu
        mode="inline"
        theme="light"
        selectedKeys={[selectedKeyFor(location.pathname)]}
        items={NAV_ITEMS}
        style={{ borderInlineEnd: 'none', flex: 1 }}
      />
      {user && (
        <Dropdown
          trigger={['click']}
          menu={{
            items: [{ key: 'logout', icon: <LogoutOutlined />, label: 'Log out' }],
            onClick: ({ key }) => {
              if (key === 'logout') void logout()
            },
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '14px 20px',
              borderTop: '1px solid #f0f0f0',
              cursor: 'pointer',
            }}
          >
            <Avatar>{initial}</Avatar>
            {!collapsed && (
              <Space orientation="vertical" size={0}>
                <Text strong>{displayName}</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {primaryRole}
                </Text>
              </Space>
            )}
          </div>
        </Dropdown>
      )}
    </Sider>
  )
}
