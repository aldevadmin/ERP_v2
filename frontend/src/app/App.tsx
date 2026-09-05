import { ConfigProvider, Layout, theme } from 'antd'
import { BrowserRouter, Route, Routes } from 'react-router'
import { AuthProvider } from '../shared/auth/AuthContext'
import RequireAuth from '../shared/auth/RequireAuth'
import CustomerDetailPage from '../modules/customers/CustomerDetailPage'
import CustomerFormPage from '../modules/customers/CustomerFormPage'
import CustomerListPage from '../modules/customers/CustomerListPage'
import CustomerProductMappingFormPage from '../modules/customer-mappings/CustomerProductMappingFormPage'
import CustomerProductMappingListPage from '../modules/customer-mappings/CustomerProductMappingListPage'
import PackagingProfileFormPage from '../modules/packaging/PackagingProfileFormPage'
import PackagingProfileListPage from '../modules/packaging/PackagingProfileListPage'
import VendorListPage from '../modules/vendors/VendorListPage'
import ItemFormPage from '../modules/items/ItemFormPage'
import ItemListPage from '../modules/items/ItemListPage'
import ProductTypeFormPage from '../modules/items/ProductTypeFormPage'
import ProductTypeListPage from '../modules/items/ProductTypeListPage'
import MaterialTypeFormPage from '../modules/items/MaterialTypeFormPage'
import MaterialTypeListPage from '../modules/items/MaterialTypeListPage'
import ShapeFormPage from '../modules/items/ShapeFormPage'
import ShapeListPage from '../modules/items/ShapeListPage'
import NamingTemplateFormPage from '../modules/items/NamingTemplateFormPage'
import NamingTemplateListPage from '../modules/items/NamingTemplateListPage'
import ItemClassificationSettingsPage from '../modules/items/ItemClassificationSettingsPage'
import UOMFormPage from '../modules/items/UOMFormPage'
import UOMListPage from '../modules/items/UOMListPage'
import ProcessCategoryFormPage from '../modules/processes/ProcessCategoryFormPage'
import ProcessCategoryListPage from '../modules/processes/ProcessCategoryListPage'
import OutputClassificationFormPage from '../modules/processes/OutputClassificationFormPage'
import OutputClassificationListPage from '../modules/processes/OutputClassificationListPage'
import ProcessFormPage from '../modules/processes/ProcessFormPage'
import ProcessListPage from '../modules/processes/ProcessListPage'
import BayFormPage from '../modules/work-centres/BayFormPage'
import BayListPage from '../modules/work-centres/BayListPage'
import WorkCentreFormPage from '../modules/work-centres/WorkCentreFormPage'
import WorkCentreListPage from '../modules/work-centres/WorkCentreListPage'
import WorkCentreTypeFormPage from '../modules/work-centres/WorkCentreTypeFormPage'
import WorkCentreTypeListPage from '../modules/work-centres/WorkCentreTypeListPage'
import ProductRouteFormPage from '../modules/product-routes/ProductRouteFormPage'
import ProductRouteListPage from '../modules/product-routes/ProductRouteListPage'
import StorageLocationFormPage from '../modules/product-routes/StorageLocationFormPage'
import StorageLocationListPage from '../modules/product-routes/StorageLocationListPage'
import ToolingFormPage from '../modules/tooling/ToolingFormPage'
import ToolingListPage from '../modules/tooling/ToolingListPage'
import ToolingTypeFormPage from '../modules/tooling/ToolingTypeFormPage'
import ToolingTypeListPage from '../modules/tooling/ToolingTypeListPage'
import SettingsLayout from '../modules/settings/SettingsLayout'
import SettingsRedirect from '../modules/settings/SettingsRedirect'
import ProductionPage from '../modules/production/ProductionPage'
import PackingLayout from '../modules/packing/PackingLayout'
import PackingOrdersPage from '../modules/packing/PackingOrdersPage'
import WeeklyPackingPlannerPage from '../modules/packing/WeeklyPackingPlannerPage'
import TodaysWorkPage from '../modules/packing/TodaysWorkPage'
import PackingJobPage from '../modules/packing/PackingJobPage'
import PackingWorkSessionPage from '../modules/packing/PackingWorkSessionPage'
import ShiftListPage from '../modules/packing/ShiftListPage'
import ShiftFormPage from '../modules/packing/ShiftFormPage'
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
              <Route
                path="/customers"
                element={
                  <SettingsLayout>
                    <CustomerListPage />
                  </SettingsLayout>
                }
              />
              <Route
                path="/customers/new"
                element={
                  <SettingsLayout>
                    <CustomerFormPage />
                  </SettingsLayout>
                }
              />
              <Route
                path="/customers/:id"
                element={
                  <SettingsLayout>
                    <CustomerDetailPage />
                  </SettingsLayout>
                }
              />
              <Route
                path="/customers/:id/edit"
                element={
                  <SettingsLayout>
                    <CustomerFormPage />
                  </SettingsLayout>
                }
              />
              <Route
                path="/customer-product-mappings"
                element={
                  <SettingsLayout>
                    <CustomerProductMappingListPage />
                  </SettingsLayout>
                }
              />
              <Route
                path="/customer-product-mappings/new"
                element={
                  <SettingsLayout>
                    <CustomerProductMappingFormPage />
                  </SettingsLayout>
                }
              />
              <Route
                path="/customer-product-mappings/:id/edit"
                element={
                  <SettingsLayout>
                    <CustomerProductMappingFormPage />
                  </SettingsLayout>
                }
              />
              <Route
                path="/packaging-profiles"
                element={
                  <SettingsLayout>
                    <PackagingProfileListPage />
                  </SettingsLayout>
                }
              />
              <Route
                path="/packaging-profiles/new"
                element={
                  <SettingsLayout>
                    <PackagingProfileFormPage />
                  </SettingsLayout>
                }
              />
              <Route
                path="/packaging-profiles/:id/edit"
                element={
                  <SettingsLayout>
                    <PackagingProfileFormPage />
                  </SettingsLayout>
                }
              />
              <Route
                path="/vendors"
                element={
                  <SettingsLayout>
                    <VendorListPage />
                  </SettingsLayout>
                }
              />
              <Route
                path="/items"
                element={
                  <SettingsLayout>
                    <ItemListPage />
                  </SettingsLayout>
                }
              />
              <Route
                path="/items/new"
                element={
                  <SettingsLayout>
                    <ItemFormPage />
                  </SettingsLayout>
                }
              />
              <Route
                path="/items/:id/edit"
                element={
                  <SettingsLayout>
                    <ItemFormPage />
                  </SettingsLayout>
                }
              />
              <Route
                path="/product-types"
                element={
                  <SettingsLayout>
                    <ProductTypeListPage />
                  </SettingsLayout>
                }
              />
              <Route
                path="/product-types/new"
                element={
                  <SettingsLayout>
                    <ProductTypeFormPage />
                  </SettingsLayout>
                }
              />
              <Route
                path="/product-types/:id/edit"
                element={
                  <SettingsLayout>
                    <ProductTypeFormPage />
                  </SettingsLayout>
                }
              />
              <Route
                path="/material-types"
                element={
                  <SettingsLayout>
                    <MaterialTypeListPage />
                  </SettingsLayout>
                }
              />
              <Route
                path="/material-types/new"
                element={
                  <SettingsLayout>
                    <MaterialTypeFormPage />
                  </SettingsLayout>
                }
              />
              <Route
                path="/material-types/:id/edit"
                element={
                  <SettingsLayout>
                    <MaterialTypeFormPage />
                  </SettingsLayout>
                }
              />
              <Route
                path="/shapes"
                element={
                  <SettingsLayout>
                    <ShapeListPage />
                  </SettingsLayout>
                }
              />
              <Route
                path="/shapes/new"
                element={
                  <SettingsLayout>
                    <ShapeFormPage />
                  </SettingsLayout>
                }
              />
              <Route
                path="/shapes/:id/edit"
                element={
                  <SettingsLayout>
                    <ShapeFormPage />
                  </SettingsLayout>
                }
              />
              <Route
                path="/naming-templates"
                element={
                  <SettingsLayout>
                    <NamingTemplateListPage />
                  </SettingsLayout>
                }
              />
              <Route
                path="/naming-templates/new"
                element={
                  <SettingsLayout>
                    <NamingTemplateFormPage />
                  </SettingsLayout>
                }
              />
              <Route
                path="/naming-templates/:id/edit"
                element={
                  <SettingsLayout>
                    <NamingTemplateFormPage />
                  </SettingsLayout>
                }
              />
              <Route
                path="/item-classification"
                element={
                  <SettingsLayout>
                    <ItemClassificationSettingsPage />
                  </SettingsLayout>
                }
              />
              <Route
                path="/uoms"
                element={
                  <SettingsLayout>
                    <UOMListPage />
                  </SettingsLayout>
                }
              />
              <Route
                path="/uoms/new"
                element={
                  <SettingsLayout>
                    <UOMFormPage />
                  </SettingsLayout>
                }
              />
              <Route
                path="/uoms/:id/edit"
                element={
                  <SettingsLayout>
                    <UOMFormPage />
                  </SettingsLayout>
                }
              />
              <Route
                path="/process-categories"
                element={
                  <SettingsLayout>
                    <ProcessCategoryListPage />
                  </SettingsLayout>
                }
              />
              <Route
                path="/process-categories/new"
                element={
                  <SettingsLayout>
                    <ProcessCategoryFormPage />
                  </SettingsLayout>
                }
              />
              <Route
                path="/process-categories/:id/edit"
                element={
                  <SettingsLayout>
                    <ProcessCategoryFormPage />
                  </SettingsLayout>
                }
              />
              <Route
                path="/output-classifications"
                element={
                  <SettingsLayout>
                    <OutputClassificationListPage />
                  </SettingsLayout>
                }
              />
              <Route
                path="/output-classifications/new"
                element={
                  <SettingsLayout>
                    <OutputClassificationFormPage />
                  </SettingsLayout>
                }
              />
              <Route
                path="/output-classifications/:id/edit"
                element={
                  <SettingsLayout>
                    <OutputClassificationFormPage />
                  </SettingsLayout>
                }
              />
              <Route
                path="/processes"
                element={
                  <SettingsLayout>
                    <ProcessListPage />
                  </SettingsLayout>
                }
              />
              <Route
                path="/processes/new"
                element={
                  <SettingsLayout>
                    <ProcessFormPage />
                  </SettingsLayout>
                }
              />
              <Route
                path="/processes/:id/edit"
                element={
                  <SettingsLayout>
                    <ProcessFormPage />
                  </SettingsLayout>
                }
              />
              <Route
                path="/work-centres"
                element={
                  <SettingsLayout>
                    <WorkCentreListPage />
                  </SettingsLayout>
                }
              />
              <Route
                path="/work-centres/new"
                element={
                  <SettingsLayout>
                    <WorkCentreFormPage />
                  </SettingsLayout>
                }
              />
              <Route
                path="/work-centres/:id/edit"
                element={
                  <SettingsLayout>
                    <WorkCentreFormPage />
                  </SettingsLayout>
                }
              />
              <Route
                path="/work-centre-types"
                element={
                  <SettingsLayout>
                    <WorkCentreTypeListPage />
                  </SettingsLayout>
                }
              />
              <Route
                path="/work-centre-types/new"
                element={
                  <SettingsLayout>
                    <WorkCentreTypeFormPage />
                  </SettingsLayout>
                }
              />
              <Route
                path="/work-centre-types/:id/edit"
                element={
                  <SettingsLayout>
                    <WorkCentreTypeFormPage />
                  </SettingsLayout>
                }
              />
              <Route
                path="/bays"
                element={
                  <SettingsLayout>
                    <BayListPage />
                  </SettingsLayout>
                }
              />
              <Route
                path="/bays/new"
                element={
                  <SettingsLayout>
                    <BayFormPage />
                  </SettingsLayout>
                }
              />
              <Route
                path="/bays/:id/edit"
                element={
                  <SettingsLayout>
                    <BayFormPage />
                  </SettingsLayout>
                }
              />
              <Route
                path="/product-routes"
                element={
                  <SettingsLayout>
                    <ProductRouteListPage />
                  </SettingsLayout>
                }
              />
              <Route
                path="/product-routes/new"
                element={
                  <SettingsLayout>
                    <ProductRouteFormPage />
                  </SettingsLayout>
                }
              />
              <Route
                path="/product-routes/:id/edit"
                element={
                  <SettingsLayout>
                    <ProductRouteFormPage />
                  </SettingsLayout>
                }
              />
              <Route
                path="/storage-locations"
                element={
                  <SettingsLayout>
                    <StorageLocationListPage />
                  </SettingsLayout>
                }
              />
              <Route
                path="/storage-locations/new"
                element={
                  <SettingsLayout>
                    <StorageLocationFormPage />
                  </SettingsLayout>
                }
              />
              <Route
                path="/storage-locations/:id/edit"
                element={
                  <SettingsLayout>
                    <StorageLocationFormPage />
                  </SettingsLayout>
                }
              />
              <Route
                path="/tooling"
                element={
                  <SettingsLayout>
                    <ToolingListPage />
                  </SettingsLayout>
                }
              />
              <Route
                path="/tooling/new"
                element={
                  <SettingsLayout>
                    <ToolingFormPage />
                  </SettingsLayout>
                }
              />
              <Route
                path="/tooling/:id/edit"
                element={
                  <SettingsLayout>
                    <ToolingFormPage />
                  </SettingsLayout>
                }
              />
              <Route
                path="/tooling-types"
                element={
                  <SettingsLayout>
                    <ToolingTypeListPage />
                  </SettingsLayout>
                }
              />
              <Route
                path="/tooling-types/new"
                element={
                  <SettingsLayout>
                    <ToolingTypeFormPage />
                  </SettingsLayout>
                }
              />
              <Route
                path="/tooling-types/:id/edit"
                element={
                  <SettingsLayout>
                    <ToolingTypeFormPage />
                  </SettingsLayout>
                }
              />
              <Route path="/production" element={<ProductionPage />} />
              <Route
                path="/packing"
                element={
                  <PackingLayout>
                    <PackingOrdersPage />
                  </PackingLayout>
                }
              />
              <Route
                path="/packing/orders"
                element={
                  <PackingLayout>
                    <PackingOrdersPage />
                  </PackingLayout>
                }
              />
              <Route
                path="/packing/planner"
                element={
                  <PackingLayout>
                    <WeeklyPackingPlannerPage />
                  </PackingLayout>
                }
              />
              <Route
                path="/packing/today"
                element={
                  <PackingLayout>
                    <TodaysWorkPage />
                  </PackingLayout>
                }
              />
              <Route path="/packing/jobs/:jobId" element={<PackingJobPage />} />
              <Route
                path="/packing/work-sessions/:sessionId"
                element={<PackingWorkSessionPage />}
              />
              <Route
                path="/shifts"
                element={
                  <SettingsLayout>
                    <ShiftListPage />
                  </SettingsLayout>
                }
              />
              <Route
                path="/shifts/new"
                element={
                  <SettingsLayout>
                    <ShiftFormPage />
                  </SettingsLayout>
                }
              />
              <Route
                path="/shifts/:id/edit"
                element={
                  <SettingsLayout>
                    <ShiftFormPage />
                  </SettingsLayout>
                }
              />
              <Route path="/inventory" element={<InventoryPage />} />
              <Route path="/settings" element={<SettingsRedirect />} />
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
