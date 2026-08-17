import { apiFetch } from '../../shared/api/http'
import type { CurrentUser } from './types'

/** Ensures the csrftoken cookie exists — call once before the first POST. */
export function getCsrf(): Promise<void> {
  return apiFetch<void>('/auth/csrf/')
}

export function login(username: string, password: string): Promise<CurrentUser> {
  return apiFetch<CurrentUser>('/auth/login/', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export function logout(): Promise<void> {
  return apiFetch<void>('/auth/logout/', { method: 'POST' })
}

export function getMe(): Promise<CurrentUser> {
  return apiFetch<CurrentUser>('/auth/me/')
}
