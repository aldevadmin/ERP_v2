import type { Employee } from '../accounts/types'

export type AddressType = 'BILLING' | 'SHIPPING' | 'BILLING_AND_SHIPPING'

export interface CustomerAddress {
  id?: number
  address_type: AddressType
  country: string
  state: string
  line1: string
  line2: string
  line3: string
  pin: string
}

export interface Customer {
  id: number
  code: string
  name: string
  main_poc: string
  emails: string[]
  phone_numbers: string[]
  internal_coordinator: number | null
  internal_coordinator_detail: Employee | null
  is_active: boolean
  addresses: CustomerAddress[]
}

export interface CustomerListItem {
  id: number
  code: string
  name: string
  main_poc: string
  internal_coordinator: number | null
  internal_coordinator_detail: Employee | null
  is_active: boolean
}

export interface CustomerListResponse {
  count: number
  next: string | null
  previous: string | null
  results: CustomerListItem[]
}

export interface CustomerFormValues {
  code: string
  name: string
  main_poc: string
  emails: string[]
  phone_numbers: string[]
  internal_coordinator: number | null
  is_active: boolean
  addresses: CustomerAddress[]
}
