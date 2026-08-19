import { ConfigProvider, Layout, theme } from 'antd'
import { BrowserRouter, Route, Routes } from 'react-router'
import { AuthProvider } from '../shared/auth/AuthContext'
import RequireAuth from '../shared/auth/RequireAuth'
import CustomerDetailPage from '../modules/customers/CustomerDetailPage'
import CustomerFormPage from '../modules/customers/CustomerFormPage'
import CustomerListPage from '../modules/customers/CustomerListPage'
import CustomerSkuMappingFormPage from '../modules/products/CustomerSkuMappingFormPage'
import CustomerSkuMappingsPage from '../modules/products/CustomerSkuMappingsPage'
import ProductFormPage from '../modules/products/ProductFormPage'
import ProductListPage from '../modules/products/ProductListPage'
import VendorListPage from '../modules/vendors/VendorListPage'
import MaterialFormPage from '../modules/materials/MaterialFormPage'
import MaterialListPage from '../modules/materials/MaterialListPage'
import ProcessCategoryFormPage from '../modules/processes/ProcessCategoryFormPage'
import ProcessCategoryListPage from '../modules/processes/ProcessCategoryListPage'
import ProcessFormPage from '../modules/processes/ProcessFormPage'
import ProcessListPage from '../modules/processes/ProcessListPage'
import SettingsPage from '../modules/settings/SettingsPage'
import ProductionPage from '../modules/production/ProductionPage'
import PackingPage from '../modules/packing/PackingPage'
import InventoryPage from '../modules/inventory/InventoryPage'
import ExportOrderDetailPage from '../modules/export-orders/ExportOrderDetailPage'
import ExportOrderEditPage from '../modules/export-orders/ExportOrderEditPage'
import ExportOrderListPage from '../modules/export-orders/ExportOrderListPage'
import AppHeader from './AppHeader'
import AppSidebar from './AppSidebar'
import DashboardPage from './DashboardPage'

const { Content } = Layout

function AuthenticatedShell() {
  return (
    <BrowserRouter>
      <Layout style={{ minHeight: '100vh' }}>
        <AppSidebar />
        <Layout>
          <AppHeader />
          <Content style={{ padding: 24, background: '#f5f7fa' }}>
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/customers" element={<CustomerListPage />} />
              <Route path="/customers/new" element={<CustomerFormPage />} />
              <Route path="/customers/:id" element={<CustomerDetailPage />} />
              <Route path="/customers/:id/edit" element={<CustomerFormPage />} />
              <Route path="/products" element={<ProductListPage />} />
              <Route path="/products/mappings" element={<CustomerSkuMappingsPage />} />
              <Route path="/products/mappings/new" element={<CustomerSkuMappingFormPage />} />
              <Route path="/products/mappings/:id/edit" element={<CustomerSkuMappingFormPage />} />
              <Route path="/products/new" element={<ProductFormPage />} />
              <Route path="/products/:id/edit" element={<ProductFormPage />} />
              <Route path="/vendors" element={<VendorListPage />} />
              <Route path="/materials" element={<MaterialListPage />} />
              <Route path="/materials/new" element={<MaterialFormPage />} />
              <Route path="/materials/:id/edit" element={<MaterialFormPage />} />
              <Route path="/process-categories" element={<ProcessCategoryListPage />} />
              <Route path="/process-categories/new" element={<ProcessCategoryFormPage />} />
              <Route path="/process-categories/:id/edit" element={<ProcessCategoryFormPage />} />
              <Route path="/processes" element={<ProcessListPage />} />
              <Route path="/processes/new" element={<ProcessFormPage />} />
              <Route path="/processes/:id/edit" element={<ProcessFormPage />} />
              <Route path="/production" element={<ProductionPage />} />
              <Route path="/packing" element={<PackingPage />} />
              <Route path="/inventory" element={<InventoryPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/export-orders" element={<ExportOrderListPage />} />
              <Route path="/export-orders/:id" element={<ExportOrderDetailPage />} />
              <Route path="/export-orders/:id/edit" element={<ExportOrderEditPage />} />
              <Route path="/export-orders/:id/:tab" element={<ExportOrderDetailPage />} />
            </Routes>
          </Content>
        </Layout>
      </Layout>
    </BrowserRouter>
  )
}

export default function App() {
  return (
    <ConfigProvider
      theme={{
        token: {
          fontSize: 16,
          controlHeight: 40,
          colorPrimary: '#155eef',
          borderRadius: 8,
          colorBgLayout: '#f5f7fa',
        },
        algorithm: theme.defaultAlgorithm,
      }}
    >
      <AuthProvider>
        <RequireAuth>
          <AuthenticatedShell />
        </RequireAuth>
      </AuthProvider>
    </ConfigProvider>
  )
}
