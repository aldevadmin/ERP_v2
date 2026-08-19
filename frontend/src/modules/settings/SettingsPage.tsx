import type { ReactNode } from 'react'
import { Flex, Tag, Typography } from 'antd'
import {
  ApartmentOutlined,
  AppstoreOutlined,
  BranchesOutlined,
  ClusterOutlined,
  GoldOutlined,
  IdcardOutlined,
  ShopOutlined,
  SwapOutlined,
  TagsOutlined,
  TeamOutlined,
  ToolOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { Link } from 'react-router'
import SectionCard from '../../shared/components/SectionCard'

const { Title, Text } = Typography

interface SettingsLink {
  label: string
  icon: ReactNode
  to?: string
}

interface SettingsGroup {
  title: string
  links: SettingsLink[]
}

const GROUPS: SettingsGroup[] = [
  {
    title: 'Master Data',
    links: [
      { label: 'Customers', icon: <TeamOutlined />, to: '/customers' },
      { label: 'Products', icon: <AppstoreOutlined />, to: '/products' },
      { label: 'Customer SKU Mappings', icon: <SwapOutlined />, to: '/products/mappings' },
      { label: 'Vendors', icon: <ShopOutlined />, to: '/vendors' },
      { label: 'Materials', icon: <GoldOutlined />, to: '/materials' },
    ],
  },
  {
    title: 'Operations',
    links: [
      { label: 'Processes', icon: <ApartmentOutlined />, to: '/processes' },
      { label: 'Process Categories', icon: <TagsOutlined />, to: '/process-categories' },
      { label: 'Product Routes', icon: <BranchesOutlined /> },
      { label: 'Work Centres', icon: <ClusterOutlined /> },
      { label: 'Tooling', icon: <ToolOutlined /> },
    ],
  },
  {
    title: 'Administration',
    links: [
      { label: 'Users', icon: <UserOutlined /> },
      { label: 'Roles', icon: <IdcardOutlined /> },
    ],
  },
]

export default function SettingsPage() {
  return (
    <SectionCard title="Settings">
      <Flex vertical gap={32}>
        {GROUPS.map((group) => (
          <div key={group.title}>
            <Title level={5} style={{ marginTop: 0, marginBottom: 12 }}>
              {group.title}
            </Title>
            <Flex vertical gap={4}>
              {group.links.map((link) =>
                link.to ? (
                  <Link
                    key={link.label}
                    to={link.to}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 4px',
                      color: 'inherit',
                    }}
                  >
                    {link.icon}
                    <Text>{link.label}</Text>
                  </Link>
                ) : (
                  <Flex key={link.label} align="center" gap={10} style={{ padding: '8px 4px' }}>
                    <Text type="secondary">{link.icon}</Text>
                    <Text type="secondary">{link.label}</Text>
                    <Tag>Not built yet</Tag>
                  </Flex>
                ),
              )}
            </Flex>
          </div>
        ))}
      </Flex>
    </SectionCard>
  )
}
