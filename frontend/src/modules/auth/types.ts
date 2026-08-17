export interface Team {
  id: number
  name: string
}

export interface Organization {
  id: number
  name: string
}

export interface Employee {
  employee_code: string
  full_name: string
  designation: string
  team: Team | null
  organization: Organization
}

export interface CurrentUser {
  id: number
  username: string
  roles: string[]
  employee: Employee | null
}
