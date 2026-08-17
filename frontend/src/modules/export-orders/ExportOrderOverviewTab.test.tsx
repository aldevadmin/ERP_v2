import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import ExportOrderOverviewTab from './ExportOrderOverviewTab'
import * as exportOrdersApi from './api'
import type { ExportOrder, ExportOrderNote, PoVersion, StageHistoryEntry } from './types'

vi.mock('./api')

const mockedApi = vi.mocked(exportOrdersApi)

afterEach(() => {
  vi.clearAllMocks()
})

const stageHistory: StageHistoryEntry[] = [
  {
    status: 'PLANNING',
    label: 'Planning',
    state: 'COMPLETED',
    entered_at: '2026-08-08T00:00:00Z',
    completed_at: '2026-08-10T00:00:00Z',
  },
  {
    status: 'FULFILMENT',
    label: 'Fulfilment',
    state: 'IN_PROGRESS',
    entered_at: '2026-08-10T00:00:00Z',
    completed_at: null,
  },
  {
    status: 'PACKING',
    label: 'Packing',
    state: 'PENDING',
    entered_at: null,
    completed_at: null,
  },
]

const order: ExportOrder = {
  id: 1,
  order_number: 'EO-2026-0001',
  customer: 1,
  customer_name: 'Acme Exports',
  customer_po_number: 'PO-100',
  customer_po_date: '2026-01-15',
  export_coordinator: 1,
  export_coordinator_detail: { id: 1, employee_code: 'EMP1', full_name: 'Jane Doe', team: null },
  country: 'USA',
  destination_port: 'Chennai',
  requested_shipment_date: '2026-02-01',
  planned_container_ready_date: '2026-02-10',
  container_type: '40ft HC',
  currency: 'USD',
  incoterm: 'FOB',
  payment_terms: 'Net 30',
  bill_to: null,
  bill_to_detail: null,
  ship_to: null,
  ship_to_detail: null,
  status: 'FULFILMENT',
  stage_history: stageHistory,
  internal_remarks: 'Handle with care',
  customer_remarks: 'Rush order',
  po_versions: [
    {
      id: 1,
      version_number: 1,
      document: 'http://localhost:8000/media/po.pdf',
      remarks: 'Initial PO',
      is_current: true,
      created_at: '2026-01-15T00:00:00Z',
      uploaded_by: 'coord1',
    },
  ],
  created_at: '2026-01-15T00:00:00Z',
  updated_at: '2026-01-15T00:00:00Z',
}

describe('ExportOrderOverviewTab', () => {
  it('renders all sections from the order prop', async () => {
    mockedApi.listExportOrderNotes.mockResolvedValue([])

    render(<ExportOrderOverviewTab order={order} onOrderUpdate={vi.fn()} />)

    expect(screen.getByText('Acme Exports')).toBeInTheDocument()
    expect(screen.getByText('Jane Doe')).toBeInTheDocument()
    expect(screen.getByText('Chennai')).toBeInTheDocument()
    expect(screen.getByText('Net 30')).toBeInTheDocument()
    expect(screen.getByText('Handle with care')).toBeInTheDocument()
    expect(screen.getByText('Initial PO')).toBeInTheDocument()
    expect(screen.getByText('40ft HC')).toBeInTheDocument()

    // Order Progress
    expect(screen.getByText('Planning')).toBeInTheDocument()
    expect(screen.getByText('Completed 10 Aug 2026')).toBeInTheDocument()
    expect(screen.getByText('Fulfilment')).toBeInTheDocument()
    expect(screen.getByText('Since 10 Aug 2026')).toBeInTheDocument()
    expect(screen.getByText('Pending')).toBeInTheDocument()

    await waitFor(() => expect(mockedApi.listExportOrderNotes).toHaveBeenCalledWith(1))
    expect(await screen.findByText('No notes yet.')).toBeInTheDocument()
  })

  it('uploads a new PO revision and reports the refreshed order upward', async () => {
    mockedApi.listExportOrderNotes.mockResolvedValue([])
    const uploaded: PoVersion = {
      id: 2,
      version_number: 2,
      document: 'http://localhost:8000/media/po-v2.pdf',
      remarks: '',
      is_current: true,
      created_at: '2026-02-01T00:00:00Z',
      uploaded_by: 'coord1',
    }
    const refreshedOrder = { ...order, po_versions: [uploaded] }
    mockedApi.uploadPoVersion.mockResolvedValue(uploaded)
    mockedApi.getExportOrder.mockResolvedValue(refreshedOrder)
    const onOrderUpdate = vi.fn()

    render(<ExportOrderOverviewTab order={order} onOrderUpdate={onOrderUpdate} />)

    fireEvent.click(screen.getByRole('button', { name: 'Upload New Revision' }))

    const file = new File(['contents'], 'po-v2.pdf', { type: 'application/pdf' })
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(fileInput, { target: { files: [file] } })

    fireEvent.click(screen.getByRole('button', { name: 'OK' }))

    await waitFor(() =>
      expect(mockedApi.uploadPoVersion).toHaveBeenCalledWith(order.id, file, ''),
    )
    await waitFor(() => expect(onOrderUpdate).toHaveBeenCalledWith(refreshedOrder))
  })

  it('lists existing notes and adds a new one', async () => {
    const existing: ExportOrderNote = {
      id: 1,
      text: 'Packing in progress.',
      author: 'coord1',
      created_at: '2026-08-12T00:00:00Z',
    }
    mockedApi.listExportOrderNotes.mockResolvedValue([existing])
    const created: ExportOrderNote = {
      id: 2,
      text: 'Container inspection scheduled.',
      author: 'coord1',
      created_at: '2026-08-13T00:00:00Z',
    }
    mockedApi.createExportOrderNote.mockResolvedValue(created)

    render(<ExportOrderOverviewTab order={order} onOrderUpdate={vi.fn()} />)

    expect(await screen.findByText('Packing in progress.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Add Note/ }))
    fireEvent.change(await screen.findByLabelText('Note'), {
      target: { value: 'Container inspection scheduled.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(mockedApi.createExportOrderNote).toHaveBeenCalledWith(
        1,
        'Container inspection scheduled.',
      ),
    )
    expect(await screen.findByText('Container inspection scheduled.')).toBeInTheDocument()
  })
})
