export interface Employee {
  id: number
  employee_code: string
  full_name: string
  team: number | null
  team_name: string | null
  designation: string
  is_active: boolean
}

export interface EmployeeListResponse {
  count: number
  next: string | null
  previous: string | null
  results: Employee[]
}

export interface EmployeeFormValues {
  employee_code: string
  full_name: string
  team?: number | null
  designation?: string
  is_active: boolean
}

export interface Team {
  id: number
  name: string
}

export interface TeamListResponse {
  count: number
  next: string | null
  previous: string | null
  results: Team[]
}
