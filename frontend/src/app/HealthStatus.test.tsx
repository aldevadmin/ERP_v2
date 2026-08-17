import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import HealthStatus from './HealthStatus'
import type { HealthResponse } from '../shared/api/client'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('HealthStatus', () => {
  it('renders the foundation status card', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})), // never resolves — keep it in "checking" state
    )

    render(<HealthStatus />)

    expect(screen.getByText('ERP Platform')).toBeInTheDocument()
    expect(screen.getByText('Frontend')).toBeInTheDocument()
    expect(screen.getByText('Running')).toBeInTheDocument()
    expect(screen.getByText('Checking…')).toBeInTheDocument()
  })

  it('shows the backend as connected once the health check succeeds', async () => {
    const health: HealthResponse = { status: 'ok', service: 'erp-backend', database: 'ok' }
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify(health), { status: 200 }))),
    )

    render(<HealthStatus />)

    await waitFor(() => expect(screen.getByText('Connected')).toBeInTheDocument())
    expect(screen.getByText('erp-backend · database ok')).toBeInTheDocument()
  })

  it('shows the backend as unreachable when the health check fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('{}', { status: 503 }))),
    )

    render(<HealthStatus />)

    await waitFor(() => expect(screen.getByText('Unreachable')).toBeInTheDocument())
  })
})
