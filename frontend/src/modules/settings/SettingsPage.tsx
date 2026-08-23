import type { ReactNode } from 'react'
import { Flex, Tag, Tooltip, Typography } from 'antd'
import {
  ApartmentOutlined,
  AppstoreOutlined,
  BranchesOutlined,
  ClusterOutlined,
  ColumnWidthOutlined,
  EnvironmentOutlined,
  ExportOutlined,
  GiftOutlined,
  GoldOutlined,
  IdcardOutlined,
  InboxOutlined,
  InfoCircleOutlined,
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
  description: string
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
      {
        label: 'Customers',
        icon: <TeamOutlined />,
        to: '/customers',
        description: 'The companies you sell export orders to, with their contacts and shipping details.',
      },
      {
        label: 'Vendors',
        icon: <ShopOutlined />,
        to: '/vendors',
        description: 'Suppliers you buy raw materials, packaging, or services from.',
      },
      {
        label: 'Items',
        icon: <InboxOutlined />,
        to: '/items',
        description:
          'The universal item catalog — raw materials, WIP, finished goods, packaging, and consumables in one place.',
      },
      {
        label: 'Product Types',
        icon: <AppstoreOutlined />,
        to: '/product-types',
        description: 'What kind of product an Item is — e.g. Plate, Bowl, Tray.',
      },
      {
        label: 'Material Types',
        icon: <GoldOutlined />,
        to: '/material-types',
        description: 'What kind of material an Item is made from — e.g. Areca Palm, Wood Veneer.',
      },
      {
        label: 'Units of Measure',
        icon: <ColumnWidthOutlined />,
        to: '/uoms',
        description: 'The units Items are stocked, purchased, and sold in — e.g. Piece, Kg, Carton.',
      },
      {
        label: 'Packaging Profiles',
        icon: <GiftOutlined />,
        to: '/packaging-profiles',
        description:
          'Reusable packing configurations for a finished item — pieces per pouch/carton, dimensions, weights.',
      },
      {
        label: 'Customer Product Mappings',
        icon: <SwapOutlined />,
        to: '/customer-product-mappings',
        description:
          'Which customer buys which item, and under what commercial and packing terms — replaces Customer SKU Mappings.',
      },
    ],
  },
  {
    title: 'Operations',
    links: [
      {
        label: 'Processes',
        icon: <ApartmentOutlined />,
        to: '/processes',
        description:
          'The steps used to make or move products (e.g. Washing, Pressing, Packing) — reusable across Production, Packing, and Inventory.',
      },
      {
        label: 'Process Categories',
        icon: <TagsOutlined />,
        to: '/process-categories',
        description:
          'Groups Processes by where they happen (e.g. Production, Packing, Quality) — used to organize and filter them.',
      },
      {
        label: 'Output Classifications',
        icon: <ExportOutlined />,
        to: '/output-classifications',
        description:
          'Labels for what a Process produces (e.g. Premium, Standard, Reject, Scrap) — used when configuring a Process’s Outputs.',
      },
      {
        label: 'Product Routes',
        icon: <BranchesOutlined />,
        to: '/product-routes',
        description: 'The sequence of Processes a product goes through, from raw material to finished good.',
      },
      {
        label: 'Storage Locations',
        icon: <EnvironmentOutlined />,
        to: '/storage-locations',
        description:
          'Where a route sends output that isn’t continuing to another process (e.g. a warehouse or reject store).',
      },
      {
        label: 'Work Centres',
        icon: <ClusterOutlined />,
        to: '/work-centres',
        description:
          'The physical machines or stations where Processes actually happen, and which Processes each one can run.',
      },
      {
        label: 'Work Centre Types',
        icon: <ClusterOutlined />,
        to: '/work-centre-types',
        description: 'What kind of resource a Work Centre is — e.g. Machine, Station.',
      },
      {
        label: 'Tooling',
        icon: <ToolOutlined />,
        to: '/tooling',
        description: 'Equipment or tools used at a Work Centre to carry out a Process.',
      },
      {
        label: 'Tooling Types',
        icon: <ToolOutlined />,
        to: '/tooling-types',
        description: 'What kind of tool a Tooling record is — e.g. Mould, Die, Jig.',
      },
    ],
  },
  {
    title: 'Administration',
    links: [
      {
        label: 'Users',
        icon: <UserOutlined />,
        description: 'People who have accounts and can log into this system.',
      },
      {
        label: 'Roles',
        icon: <IdcardOutlined />,
        description: 'Permission groups that control what each user can see and do.',
      },
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
                    <Tooltip title={link.description}>
                      <InfoCircleOutlined
                        style={{ color: '#8c8c8c', fontSize: 13 }}
                        onClick={(e) => e.preventDefault()}
                      />
                    </Tooltip>
                  </Link>
                ) : (
                  <Flex key={link.label} align="center" gap={10} style={{ padding: '8px 4px' }}>
                    <Text type="secondary">{link.icon}</Text>
                    <Text type="secondary">{link.label}</Text>
                    <Tooltip title={link.description}>
                      <InfoCircleOutlined style={{ color: '#8c8c8c', fontSize: 13 }} />
                    </Tooltip>
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
