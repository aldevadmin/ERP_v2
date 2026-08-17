import { Segmented } from 'antd'
import { useLocation, useNavigate } from 'react-router'

const OPTIONS = [
  { label: 'Products', value: '/products' },
  { label: 'Customer SKU Mappings', value: '/products/mappings' },
]

/** Shared tab switcher between the two Products screens — no separate
 * top-level nav entry for the mappings table, per "keep UI simple." */
export default function ProductsTabs() {
  const navigate = useNavigate()
  const location = useLocation()
  const current = location.pathname === '/products/mappings' ? '/products/mappings' : '/products'

  return (
    <Segmented
      value={current}
      options={OPTIONS}
      onChange={(value) => navigate(String(value))}
      style={{ marginBottom: 16 }}
    />
  )
}
