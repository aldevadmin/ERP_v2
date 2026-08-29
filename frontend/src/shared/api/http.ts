const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api/v1'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

/**
 * `JSON.stringify` silently drops any object key whose value is
 * `undefined` — exactly what an antd `allowClear` Select produces when a
 * nullable field gets cleared back to blank. For a PATCH body, an omitted
 * key means "leave this field unchanged," not "clear it," so a cleared
 * field would silently fail to save (the old value survives untouched)
 * unless `undefined` is converted to an explicit `null` first. Use this
 * instead of `JSON.stringify` for any request body built from form values
 * that include a clearable nullable field.
 */
export function jsonBody(values: unknown): string {
  return JSON.stringify(values, (_key, value) => (value === undefined ? null : value))
}

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

/**
 * Fetch wrapper shared by every module's API client: same-session cookies
 * (`credentials: 'include'`) plus the CSRF header Django's session auth
 * requires on unsafe methods, read from the `csrftoken` cookie the backend
 * sets (see auth/api.ts's `getCsrf`).
 */
export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase()
  const headers = new Headers(options.headers)
  // File uploads (FormData bodies) must NOT set Content-Type explicitly —
  // the browser needs to add the multipart boundary itself.
  if (!(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }

  if (!SAFE_METHODS.has(method)) {
    const csrfToken = getCookie('csrftoken')
    if (csrfToken) headers.set('X-CSRFToken', csrfToken)
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    method,
    headers,
    credentials: 'include',
  })

  if (!response.ok) {
    let detail: string | undefined
    try {
      const body: unknown = await response.json()
      if (body && typeof body === 'object') {
        const value = (body as { detail: unknown }).detail
        if (typeof value === 'string') {
          detail = value
        } else {
          // DRF field-level ValidationErrors have no `detail` key — they
          // come back as {field: ["message", ...]}. Surface the first one
          // so callers show something more useful than a generic status
          // message (e.g. the export-order-line packing-config error).
          for (const fieldValue of Object.values(body as Record<string, unknown>)) {
            if (typeof fieldValue === 'string') {
              detail = fieldValue
              break
            }
            if (Array.isArray(fieldValue) && typeof fieldValue[0] === 'string') {
              detail = fieldValue[0]
              break
            }
          }
        }
      }
    } catch {
      // Non-JSON error body — fall through to the generic message.
    }
    throw new ApiError(
      detail ?? `Request to ${path} failed with status ${response.status}`,
      response.status,
    )
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}
