export interface Employee {
  id: number
  employee_code: string
  full_name: string
  team: number | null
}

export interface EmployeeListResponse {
  count: number
  next: string | null
  previous: string | null
  results: Employee[]
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
