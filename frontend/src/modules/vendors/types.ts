export interface Vendor {
  id: number
  code: string
  name: string
  category: string
  is_active: boolean
}

export interface VendorListResponse {
  count: number
  next: string | null
  previous: string | null
  results: Vendor[]
}
