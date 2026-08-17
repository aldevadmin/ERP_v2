import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import UploadPoVersionModal from './UploadPoVersionModal'
import * as exportOrdersApi from './api'
import type { ExportOrder, PoVersion } from './types'

vi.mock('./api')

const mockedApi = vi.mocked(exportOrdersApi)

afterEach(() => {
  vi.clearAllMocks()
})

const uploaded: PoVersion = {
  id: 2,
  version_number: 2,
  document: 'http://localhost:8000/media/po-v2.pdf',
  remarks: 'Revised quantities',
  is_current: true,
  created_at: '2026-01-20T00:00:00Z',
  uploaded_by: 'coord1',
}

const refreshedOrder = { po_versions: [uploaded] } as unknown as ExportOrder

describe('UploadPoVersionModal', () => {
  it('uploads a new PO revision', async () => {
    mockedApi.uploadPoVersion.mockResolvedValue(uploaded)
    mockedApi.getExportOrder.mockResolvedValue(refreshedOrder)
    const onUploaded = vi.fn()

    render(
      <UploadPoVersionModal
        open
        exportOrderId={1}
        onClose={vi.fn()}
        onUploaded={onUploaded}
      />,
    )

    const file = new File(['contents'], 'po-v2.pdf', { type: 'application/pdf' })
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(fileInput, { target: { files: [file] } })

    fireEvent.change(screen.getByLabelText('Remarks'), {
      target: { value: 'Revised quantities' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'OK' }))

    await waitFor(() =>
      expect(mockedApi.uploadPoVersion).toHaveBeenCalledWith(1, file, 'Revised quantities'),
    )
    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith(refreshedOrder))
  })

  it('shows an error when no file is selected', async () => {
    render(
      <UploadPoVersionModal open exportOrderId={1} onClose={vi.fn()} onUploaded={vi.fn()} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'OK' }))

    expect(await screen.findByText('Select a file to upload.')).toBeInTheDocument()
    expect(mockedApi.uploadPoVersion).not.toHaveBeenCalled()
  })
})
