import { apiFetch, jsonBody } from '../../shared/api/http'
import type {
  Item,
  ItemClass,
  ItemFieldRule,
  ItemFieldRuleState,
  ItemFormValues,
  ItemListResponse,
  MaterialType,
  MaterialTypeFormValues,
  MaterialTypeListResponse,
  NamingTemplate,
  NamingTemplateFormValues,
  NamingTemplateListResponse,
  ProductType,
  ProductTypeFormValues,
  ProductTypeListResponse,
  Shape,
  ShapeFormValues,
  ShapeListResponse,
  UOM,
  UOMFormValues,
  UOMListResponse,
} from './types'

export interface ListItemsParams {
  search?: string
  itemClass?: ItemClass
  productType?: number
  materialType?: number
  isActive?: boolean
  capability?: 'purchasable' | 'manufacturable' | 'stockable' | 'sellable'
}

export function listItems(params: ListItemsParams = {}): Promise<ItemListResponse> {
  const query = new URLSearchParams()
  if (params.search) query.set('search', params.search)
  if (params.itemClass) query.set('item_class', params.itemClass)
  if (params.productType !== undefined) query.set('product_type', String(params.productType))
  if (params.materialType !== undefined) query.set('material_type', String(params.materialType))
  if (params.isActive !== undefined) query.set('is_active', String(params.isActive))
  if (params.capability) query.set('capability', params.capability)
  const queryString = query.toString()
  return apiFetch<ItemListResponse>(`/items/${queryString ? `?${queryString}` : ''}`)
}

export function getItem(id: number): Promise<Item> {
  return apiFetch<Item>(`/items/${id}/`)
}

export function createItem(values: ItemFormValues): Promise<Item> {
  return apiFetch<Item>('/items/', { method: 'POST', body: jsonBody(values) })
}

export function updateItem(id: number, values: Partial<ItemFormValues>): Promise<Item> {
  return apiFetch<Item>(`/items/${id}/`, { method: 'PATCH', body: jsonBody(values) })
}

export function deleteItem(id: number): Promise<void> {
  return apiFetch<void>(`/items/${id}/`, { method: 'DELETE' })
}

// Unpaginated on the server (always exactly 24 rows) — a plain array, not
// the usual {count, results} wrapper.
export function listItemFieldRules(): Promise<ItemFieldRule[]> {
  return apiFetch<ItemFieldRule[]>('/item-field-rules/')
}

export function updateItemFieldRule(id: number, state: ItemFieldRuleState): Promise<ItemFieldRule> {
  return apiFetch<ItemFieldRule>(`/item-field-rules/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify({ state }),
  })
}

export interface ListProductTypesParams {
  search?: string
  isActive?: boolean
}

export function listProductTypes(
  params: ListProductTypesParams = {},
): Promise<ProductTypeListResponse> {
  const query = new URLSearchParams()
  if (params.search) query.set('search', params.search)
  if (params.isActive !== undefined) query.set('is_active', String(params.isActive))
  const queryString = query.toString()
  return apiFetch<ProductTypeListResponse>(`/product-types/${queryString ? `?${queryString}` : ''}`)
}

export function getProductType(id: number): Promise<ProductType> {
  return apiFetch<ProductType>(`/product-types/${id}/`)
}

export function createProductType(values: ProductTypeFormValues): Promise<ProductType> {
  return apiFetch<ProductType>('/product-types/', { method: 'POST', body: JSON.stringify(values) })
}

export function updateProductType(
  id: number,
  values: ProductTypeFormValues,
): Promise<ProductType> {
  return apiFetch<ProductType>(`/product-types/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(values),
  })
}

export function deleteProductType(id: number): Promise<void> {
  return apiFetch<void>(`/product-types/${id}/`, { method: 'DELETE' })
}

// A separate, narrow update for the Item Classification settings screen —
// only ever touches `applicable_item_classes`, distinct from the regular
// edit form's `updateProductType` (which never collects this field).
export function updateProductTypeClasses(
  id: number,
  classes: ItemClass[],
): Promise<ProductType> {
  return apiFetch<ProductType>(`/product-types/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify({ applicable_item_classes: classes }),
  })
}

export interface ListMaterialTypesParams {
  search?: string
  isActive?: boolean
}

export function listMaterialTypes(
  params: ListMaterialTypesParams = {},
): Promise<MaterialTypeListResponse> {
  const query = new URLSearchParams()
  if (params.search) query.set('search', params.search)
  if (params.isActive !== undefined) query.set('is_active', String(params.isActive))
  const queryString = query.toString()
  return apiFetch<MaterialTypeListResponse>(
    `/material-types/${queryString ? `?${queryString}` : ''}`,
  )
}

export function getMaterialType(id: number): Promise<MaterialType> {
  return apiFetch<MaterialType>(`/material-types/${id}/`)
}

export function createMaterialType(values: MaterialTypeFormValues): Promise<MaterialType> {
  return apiFetch<MaterialType>('/material-types/', {
    method: 'POST',
    body: JSON.stringify(values),
  })
}

export function updateMaterialType(
  id: number,
  values: MaterialTypeFormValues,
): Promise<MaterialType> {
  return apiFetch<MaterialType>(`/material-types/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(values),
  })
}

export function deleteMaterialType(id: number): Promise<void> {
  return apiFetch<void>(`/material-types/${id}/`, { method: 'DELETE' })
}

// Same narrow-update idea as `updateProductTypeClasses` above.
export function updateMaterialTypeClasses(
  id: number,
  classes: ItemClass[],
): Promise<MaterialType> {
  return apiFetch<MaterialType>(`/material-types/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify({ applicable_item_classes: classes }),
  })
}

export interface ListUOMsParams {
  search?: string
  isActive?: boolean
}

export function listUOMs(params: ListUOMsParams = {}): Promise<UOMListResponse> {
  const query = new URLSearchParams()
  if (params.search) query.set('search', params.search)
  if (params.isActive !== undefined) query.set('is_active', String(params.isActive))
  const queryString = query.toString()
  return apiFetch<UOMListResponse>(`/uoms/${queryString ? `?${queryString}` : ''}`)
}

export function getUOM(id: number): Promise<UOM> {
  return apiFetch<UOM>(`/uoms/${id}/`)
}

export function createUOM(values: UOMFormValues): Promise<UOM> {
  return apiFetch<UOM>('/uoms/', { method: 'POST', body: JSON.stringify(values) })
}

export function updateUOM(id: number, values: UOMFormValues): Promise<UOM> {
  return apiFetch<UOM>(`/uoms/${id}/`, { method: 'PATCH', body: JSON.stringify(values) })
}

export function deleteUOM(id: number): Promise<void> {
  return apiFetch<void>(`/uoms/${id}/`, { method: 'DELETE' })
}

export interface ListShapesParams {
  search?: string
  isActive?: boolean
}

export function listShapes(params: ListShapesParams = {}): Promise<ShapeListResponse> {
  const query = new URLSearchParams()
  if (params.search) query.set('search', params.search)
  if (params.isActive !== undefined) query.set('is_active', String(params.isActive))
  const queryString = query.toString()
  return apiFetch<ShapeListResponse>(`/shapes/${queryString ? `?${queryString}` : ''}`)
}

export function getShape(id: number): Promise<Shape> {
  return apiFetch<Shape>(`/shapes/${id}/`)
}

export function createShape(values: ShapeFormValues): Promise<Shape> {
  return apiFetch<Shape>('/shapes/', { method: 'POST', body: JSON.stringify(values) })
}

export function updateShape(id: number, values: ShapeFormValues): Promise<Shape> {
  return apiFetch<Shape>(`/shapes/${id}/`, { method: 'PATCH', body: JSON.stringify(values) })
}

export function deleteShape(id: number): Promise<void> {
  return apiFetch<void>(`/shapes/${id}/`, { method: 'DELETE' })
}

export interface ListNamingTemplatesParams {
  search?: string
  itemClass?: ItemClass
  isActive?: boolean
}

export function listNamingTemplates(
  params: ListNamingTemplatesParams = {},
): Promise<NamingTemplateListResponse> {
  const query = new URLSearchParams()
  if (params.search) query.set('search', params.search)
  if (params.itemClass) query.set('item_class', params.itemClass)
  if (params.isActive !== undefined) query.set('is_active', String(params.isActive))
  const queryString = query.toString()
  return apiFetch<NamingTemplateListResponse>(
    `/naming-templates/${queryString ? `?${queryString}` : ''}`,
  )
}

export function getNamingTemplate(id: number): Promise<NamingTemplate> {
  return apiFetch<NamingTemplate>(`/naming-templates/${id}/`)
}

export function createNamingTemplate(
  values: NamingTemplateFormValues,
): Promise<NamingTemplate> {
  return apiFetch<NamingTemplate>('/naming-templates/', {
    method: 'POST',
    body: jsonBody(values),
  })
}

export function updateNamingTemplate(
  id: number,
  values: NamingTemplateFormValues,
): Promise<NamingTemplate> {
  return apiFetch<NamingTemplate>(`/naming-templates/${id}/`, {
    method: 'PATCH',
    body: jsonBody(values),
  })
}

export function deleteNamingTemplate(id: number): Promise<void> {
  return apiFetch<void>(`/naming-templates/${id}/`, { method: 'DELETE' })
}
