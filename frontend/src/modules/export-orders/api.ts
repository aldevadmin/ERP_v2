import { apiFetch } from '../../shared/api/http'
import type {
  CreateExportOrderValues,
  ExportOrder,
  ExportOrderEditValues,
  ExportOrderLine,
  ExportOrderLineFormValues,
  ExportOrderListResponse,
  ExportOrderNote,
  FulfilmentTransactionListResponse,
  LoadingTransaction,
  LoadingTransactionFormValues,
  LoadingTransactionLogResponse,
  PackingMaterialRequirement,
  PackingMaterialRequirementFormValues,
  PackingMaterialRequirementSummary,
  PackingMaterialType,
  PackingMonitorRow,
  PackingTransaction,
  PackingTransactionFormValues,
  PackingTransactionLogResponse,
  PoVersion,
  ProcurementRequirementSummary,
  ProcurementTransaction,
  ProcurementTransactionFormValues,
  ProductionRequirementSummary,
  ProductionTransaction,
  ProductionTransactionFormValues,
  Shipment,
  ShipmentFormValues,
  ShipmentLine,
  ShipmentLineFormValues,
  SKUSupplyPlan,
  SKUSupplyPlanFormValues,
  SKUSupplyPlanSummary,
} from './types'

export interface ListExportOrdersParams {
  search?: string
  status?: string
  customer?: number
  crdFrom?: string
  crdTo?: string
  page?: number
}

export function listExportOrders(
  params: ListExportOrdersParams = {},
): Promise<ExportOrderListResponse> {
  const query = new URLSearchParams()
  if (params.search) query.set('search', params.search)
  if (params.status) query.set('status', params.status)
  if (params.customer) query.set('customer', String(params.customer))
  if (params.crdFrom) query.set('crd_from', params.crdFrom)
  if (params.crdTo) query.set('crd_to', params.crdTo)
  if (params.page) query.set('page', String(params.page))
  const queryString = query.toString()
  return apiFetch<ExportOrderListResponse>(`/export-orders/${queryString ? `?${queryString}` : ''}`)
}

export function getExportOrder(id: number): Promise<ExportOrder> {
  return apiFetch<ExportOrder>(`/export-orders/${id}/`)
}

export function createExportOrder(values: CreateExportOrderValues): Promise<ExportOrder> {
  return apiFetch<ExportOrder>('/export-orders/', {
    method: 'POST',
    body: JSON.stringify(values),
  })
}

export function updateExportOrder(
  id: number,
  values: Partial<ExportOrderEditValues>,
): Promise<ExportOrder> {
  return apiFetch<ExportOrder>(`/export-orders/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(values),
  })
}

export function cancelExportOrder(id: number): Promise<ExportOrder> {
  return apiFetch<ExportOrder>(`/export-orders/${id}/cancel/`, { method: 'POST' })
}

export function advanceExportOrder(id: number): Promise<ExportOrder> {
  return apiFetch<ExportOrder>(`/export-orders/${id}/advance/`, { method: 'POST' })
}

export function listExportOrderNotes(exportOrderId: number): Promise<ExportOrderNote[]> {
  return apiFetch<{ results: ExportOrderNote[] }>(`/export-orders/${exportOrderId}/notes/`).then(
    (response) => response.results,
  )
}

export function createExportOrderNote(
  exportOrderId: number,
  text: string,
): Promise<ExportOrderNote> {
  return apiFetch<ExportOrderNote>(`/export-orders/${exportOrderId}/notes/`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  })
}

export function uploadPoVersion(
  exportOrderId: number,
  file: File,
  remarks: string,
): Promise<PoVersion> {
  const formData = new FormData()
  formData.append('document', file)
  if (remarks) formData.append('remarks', remarks)
  return apiFetch<PoVersion>(`/export-orders/${exportOrderId}/po-versions/`, {
    method: 'POST',
    body: formData,
  })
}

export function listExportOrderLines(exportOrderId: number): Promise<ExportOrderLine[]> {
  return apiFetch<ExportOrderLine[]>(`/export-orders/${exportOrderId}/lines/`)
}

export function createExportOrderLine(
  exportOrderId: number,
  values: ExportOrderLineFormValues,
): Promise<ExportOrderLine> {
  return apiFetch<ExportOrderLine>(`/export-orders/${exportOrderId}/lines/`, {
    method: 'POST',
    body: JSON.stringify(values),
  })
}

export function updateExportOrderLine(
  exportOrderId: number,
  lineId: number,
  values: Partial<ExportOrderLineFormValues>,
): Promise<ExportOrderLine> {
  return apiFetch<ExportOrderLine>(`/export-orders/${exportOrderId}/lines/${lineId}/`, {
    method: 'PATCH',
    body: JSON.stringify(values),
  })
}

export function deleteExportOrderLine(exportOrderId: number, lineId: number): Promise<void> {
  return apiFetch<void>(`/export-orders/${exportOrderId}/lines/${lineId}/`, { method: 'DELETE' })
}

export function listSkuSupplyPlans(exportOrderId: number): Promise<SKUSupplyPlanSummary[]> {
  return apiFetch<SKUSupplyPlanSummary[]>(`/export-orders/${exportOrderId}/supply-plans/`)
}

export function updateSkuSupplyPlan(
  exportOrderId: number,
  lineId: number,
  values: Partial<SKUSupplyPlanFormValues>,
): Promise<SKUSupplyPlan> {
  return apiFetch<SKUSupplyPlan>(`/export-orders/${exportOrderId}/lines/${lineId}/supply-plan/`, {
    method: 'PATCH',
    body: JSON.stringify(values),
  })
}

export function listProductionRequirements(
  exportOrderId: number,
): Promise<ProductionRequirementSummary[]> {
  return apiFetch<ProductionRequirementSummary[]>(
    `/export-orders/${exportOrderId}/production-requirements/`,
  )
}

export function listProductionTransactions(
  exportOrderId: number,
  lineId: number,
): Promise<ProductionTransaction[]> {
  return apiFetch<ProductionTransaction[]>(
    `/export-orders/${exportOrderId}/lines/${lineId}/production-transactions/`,
  )
}

export function createProductionTransaction(
  exportOrderId: number,
  lineId: number,
  values: ProductionTransactionFormValues,
): Promise<ProductionTransaction> {
  return apiFetch<ProductionTransaction>(
    `/export-orders/${exportOrderId}/lines/${lineId}/production-transactions/`,
    { method: 'POST', body: JSON.stringify(values) },
  )
}

export function updateProductionTransaction(
  exportOrderId: number,
  lineId: number,
  transactionId: number,
  values: Partial<ProductionTransactionFormValues>,
): Promise<ProductionTransaction> {
  return apiFetch<ProductionTransaction>(
    `/export-orders/${exportOrderId}/lines/${lineId}/production-transactions/${transactionId}/`,
    { method: 'PATCH', body: JSON.stringify(values) },
  )
}

export function listProcurementRequirements(
  exportOrderId: number,
): Promise<ProcurementRequirementSummary[]> {
  return apiFetch<ProcurementRequirementSummary[]>(
    `/export-orders/${exportOrderId}/procurement-requirements/`,
  )
}

export function listProcurementTransactions(
  exportOrderId: number,
  lineId: number,
): Promise<ProcurementTransaction[]> {
  return apiFetch<ProcurementTransaction[]>(
    `/export-orders/${exportOrderId}/lines/${lineId}/procurement-transactions/`,
  )
}

export function createProcurementTransaction(
  exportOrderId: number,
  lineId: number,
  values: ProcurementTransactionFormValues,
): Promise<ProcurementTransaction> {
  return apiFetch<ProcurementTransaction>(
    `/export-orders/${exportOrderId}/lines/${lineId}/procurement-transactions/`,
    { method: 'POST', body: JSON.stringify(values) },
  )
}

export function updateProcurementTransaction(
  exportOrderId: number,
  lineId: number,
  transactionId: number,
  values: Partial<ProcurementTransactionFormValues>,
): Promise<ProcurementTransaction> {
  return apiFetch<ProcurementTransaction>(
    `/export-orders/${exportOrderId}/lines/${lineId}/procurement-transactions/${transactionId}/`,
    { method: 'PATCH', body: JSON.stringify(values) },
  )
}

export interface ListFulfilmentTransactionsParams {
  line?: number
  page?: number
}

export function listFulfilmentTransactions(
  exportOrderId: number,
  params: ListFulfilmentTransactionsParams = {},
): Promise<FulfilmentTransactionListResponse> {
  const query = new URLSearchParams()
  if (params.line) query.set('line', String(params.line))
  if (params.page) query.set('page', String(params.page))
  const queryString = query.toString()
  return apiFetch<FulfilmentTransactionListResponse>(
    `/export-orders/${exportOrderId}/fulfilment-transactions/${queryString ? `?${queryString}` : ''}`,
  )
}

export function listPackingMaterialRequirements(
  exportOrderId: number,
  materialType: PackingMaterialType,
): Promise<PackingMaterialRequirementSummary[]> {
  return apiFetch<PackingMaterialRequirementSummary[]>(
    `/export-orders/${exportOrderId}/packing-material-requirements/?material_type=${materialType}`,
  )
}

export function getPackingMaterialRequirement(
  exportOrderId: number,
  lineId: number,
  materialType: PackingMaterialType,
): Promise<PackingMaterialRequirement> {
  return apiFetch<PackingMaterialRequirement>(
    `/export-orders/${exportOrderId}/lines/${lineId}/packing-material-requirements/${materialType}/`,
  )
}

export function updatePackingMaterialRequirement(
  exportOrderId: number,
  lineId: number,
  materialType: PackingMaterialType,
  values: Partial<PackingMaterialRequirementFormValues>,
): Promise<PackingMaterialRequirement> {
  return apiFetch<PackingMaterialRequirement>(
    `/export-orders/${exportOrderId}/lines/${lineId}/packing-material-requirements/${materialType}/`,
    { method: 'PATCH', body: JSON.stringify(values) },
  )
}

export function listPackingMonitor(exportOrderId: number): Promise<PackingMonitorRow[]> {
  return apiFetch<PackingMonitorRow[]>(`/export-orders/${exportOrderId}/packing-monitor/`)
}

export interface ListPackingTransactionsLogParams {
  line?: number
  page?: number
  pageSize?: number
}

export function listPackingTransactionsLog(
  exportOrderId: number,
  params: ListPackingTransactionsLogParams = {},
): Promise<PackingTransactionLogResponse> {
  const query = new URLSearchParams()
  if (params.line) query.set('line', String(params.line))
  if (params.page) query.set('page', String(params.page))
  if (params.pageSize) query.set('page_size', String(params.pageSize))
  const queryString = query.toString()
  return apiFetch<PackingTransactionLogResponse>(
    `/export-orders/${exportOrderId}/packing-transactions/${queryString ? `?${queryString}` : ''}`,
  )
}

export function listPackingTransactions(
  exportOrderId: number,
  lineId: number,
): Promise<PackingTransaction[]> {
  return apiFetch<PackingTransaction[]>(
    `/export-orders/${exportOrderId}/lines/${lineId}/packing-transactions/`,
  )
}

export function createPackingTransaction(
  exportOrderId: number,
  lineId: number,
  values: PackingTransactionFormValues,
): Promise<PackingTransaction> {
  return apiFetch<PackingTransaction>(
    `/export-orders/${exportOrderId}/lines/${lineId}/packing-transactions/`,
    { method: 'POST', body: JSON.stringify(values) },
  )
}

export function updatePackingTransaction(
  exportOrderId: number,
  lineId: number,
  transactionId: number,
  values: Partial<PackingTransactionFormValues>,
): Promise<PackingTransaction> {
  return apiFetch<PackingTransaction>(
    `/export-orders/${exportOrderId}/lines/${lineId}/packing-transactions/${transactionId}/`,
    { method: 'PATCH', body: JSON.stringify(values) },
  )
}

export function listShipments(exportOrderId: number): Promise<Shipment[]> {
  return apiFetch<Shipment[]>(`/export-orders/${exportOrderId}/shipments/`)
}

export function createShipment(
  exportOrderId: number,
  values: ShipmentFormValues,
): Promise<Shipment> {
  return apiFetch<Shipment>(`/export-orders/${exportOrderId}/shipments/`, {
    method: 'POST',
    body: JSON.stringify(values),
  })
}

export function updateShipment(
  exportOrderId: number,
  shipmentId: number,
  values: Partial<ShipmentFormValues>,
): Promise<Shipment> {
  return apiFetch<Shipment>(`/export-orders/${exportOrderId}/shipments/${shipmentId}/`, {
    method: 'PATCH',
    body: JSON.stringify(values),
  })
}

export function deleteShipment(exportOrderId: number, shipmentId: number): Promise<void> {
  return apiFetch<void>(`/export-orders/${exportOrderId}/shipments/${shipmentId}/`, {
    method: 'DELETE',
  })
}

export function listShipmentLines(
  exportOrderId: number,
  shipmentId: number,
): Promise<ShipmentLine[]> {
  return apiFetch<ShipmentLine[]>(
    `/export-orders/${exportOrderId}/shipments/${shipmentId}/lines/`,
  )
}

export function createShipmentLine(
  exportOrderId: number,
  shipmentId: number,
  values: ShipmentLineFormValues,
): Promise<ShipmentLine> {
  return apiFetch<ShipmentLine>(
    `/export-orders/${exportOrderId}/shipments/${shipmentId}/lines/`,
    { method: 'POST', body: JSON.stringify(values) },
  )
}

export function updateShipmentLine(
  exportOrderId: number,
  shipmentId: number,
  lineId: number,
  values: Partial<ShipmentLineFormValues>,
): Promise<ShipmentLine> {
  return apiFetch<ShipmentLine>(
    `/export-orders/${exportOrderId}/shipments/${shipmentId}/lines/${lineId}/`,
    { method: 'PATCH', body: JSON.stringify(values) },
  )
}

export function deleteShipmentLine(
  exportOrderId: number,
  shipmentId: number,
  lineId: number,
): Promise<void> {
  return apiFetch<void>(
    `/export-orders/${exportOrderId}/shipments/${shipmentId}/lines/${lineId}/`,
    { method: 'DELETE' },
  )
}

export function listLoadingTransactions(
  exportOrderId: number,
  shipmentId: number,
  lineId: number,
): Promise<LoadingTransaction[]> {
  return apiFetch<LoadingTransaction[]>(
    `/export-orders/${exportOrderId}/shipments/${shipmentId}/lines/${lineId}/loading-transactions/`,
  )
}

export function createLoadingTransaction(
  exportOrderId: number,
  shipmentId: number,
  lineId: number,
  values: LoadingTransactionFormValues,
): Promise<LoadingTransaction> {
  return apiFetch<LoadingTransaction>(
    `/export-orders/${exportOrderId}/shipments/${shipmentId}/lines/${lineId}/loading-transactions/`,
    { method: 'POST', body: JSON.stringify(values) },
  )
}

export function updateLoadingTransaction(
  exportOrderId: number,
  shipmentId: number,
  lineId: number,
  transactionId: number,
  values: Partial<LoadingTransactionFormValues>,
): Promise<LoadingTransaction> {
  return apiFetch<LoadingTransaction>(
    `/export-orders/${exportOrderId}/shipments/${shipmentId}/lines/${lineId}/` +
      `loading-transactions/${transactionId}/`,
    { method: 'PATCH', body: JSON.stringify(values) },
  )
}

export interface ListLoadingTransactionsLogParams {
  line?: number
  page?: number
  pageSize?: number
}

export function listLoadingTransactionsLog(
  exportOrderId: number,
  shipmentId: number,
  params: ListLoadingTransactionsLogParams = {},
): Promise<LoadingTransactionLogResponse> {
  const query = new URLSearchParams()
  if (params.line) query.set('line', String(params.line))
  if (params.page) query.set('page', String(params.page))
  if (params.pageSize) query.set('page_size', String(params.pageSize))
  const queryString = query.toString()
  return apiFetch<LoadingTransactionLogResponse>(
    `/export-orders/${exportOrderId}/shipments/${shipmentId}/loading-transactions/` +
      `${queryString ? `?${queryString}` : ''}`,
  )
}
