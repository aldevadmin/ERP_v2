import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import Step5OutputCaptureForm from './Step5OutputCaptureForm'
import * as processesApi from './api'
import type { ProcessOutputCaptureFormValues } from './types'

vi.mock('./api')

const mockedApi = vi.mocked(processesApi)

afterEach(() => {
  vi.clearAllMocks()
})

const workCentreTotal: ProcessOutputCaptureFormValues = {
  capture_mode: 'WORK_CENTRE_TOTAL',
  position_label: '',
  default_position_count: null,
  allow_work_centre_override: true,
  allow_different_sku_per_position: true,
}

const positionLevel: ProcessOutputCaptureFormValues = {
  capture_mode: 'POSITION_LEVEL',
  position_label: 'Mould Position',
  default_position_count: 6,
  allow_work_centre_override: true,
  allow_different_sku_per_position: true,
}

describe('Step5OutputCaptureForm', () => {
  it('shows the header question and all capture mode options', () => {
    render(
      <Step5OutputCaptureForm
        versionId={1}
        captureMode=""
        positionLabel=""
        defaultPositionCount={null}
        allowWorkCentreOverride={true}
        allowDifferentSkuPerPosition={true}
        onSaved={vi.fn()}
        onContinue={vi.fn()}
      />,
    )

    expect(screen.getByText('How should output be recorded?')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'One total for the work centre' })).toBeInTheDocument()
    expect(
      screen.getByRole('radio', { name: 'Separate output from parallel positions' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Both' })).toBeInTheDocument()
    expect(screen.queryByLabelText(/positions be called/)).not.toBeInTheDocument()
  })

  it('saves immediately when Work Centre Total is selected', async () => {
    mockedApi.saveProcessOutputCapture.mockResolvedValue(workCentreTotal)

    render(
      <Step5OutputCaptureForm
        versionId={1}
        captureMode=""
        positionLabel=""
        defaultPositionCount={null}
        allowWorkCentreOverride={true}
        allowDifferentSkuPerPosition={true}
        onSaved={vi.fn()}
        onContinue={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('radio', { name: 'One total for the work centre' }))

    await waitFor(() =>
      expect(mockedApi.saveProcessOutputCapture).toHaveBeenCalledWith(1, {
        capture_mode: 'WORK_CENTRE_TOTAL',
        position_label: '',
        default_position_count: null,
        allow_work_centre_override: true,
        allow_different_sku_per_position: true,
      }),
    )
  })

  it('reveals position fields without saving until both are filled in', async () => {
    render(
      <Step5OutputCaptureForm
        versionId={1}
        captureMode=""
        positionLabel=""
        defaultPositionCount={null}
        allowWorkCentreOverride={true}
        allowDifferentSkuPerPosition={true}
        onSaved={vi.fn()}
        onContinue={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('radio', { name: 'Separate output from parallel positions' }))

    expect(
      await screen.findByLabelText('What should these positions be called in this UI?'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Default number of positions')).toBeInTheDocument()
    expect(mockedApi.saveProcessOutputCapture).not.toHaveBeenCalled()
  })

  it('saves the whole group once Position Label and Default Position Count are both filled in', async () => {
    mockedApi.saveProcessOutputCapture.mockResolvedValue(positionLevel)

    render(
      <Step5OutputCaptureForm
        versionId={1}
        captureMode=""
        positionLabel=""
        defaultPositionCount={null}
        allowWorkCentreOverride={true}
        allowDifferentSkuPerPosition={true}
        onSaved={vi.fn()}
        onContinue={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('radio', { name: 'Separate output from parallel positions' }))

    const labelInput = await screen.findByLabelText(
      'What should these positions be called in this UI?',
    )
    fireEvent.change(labelInput, { target: { value: 'Mould Position' } })
    fireEvent.blur(labelInput)

    expect(mockedApi.saveProcessOutputCapture).not.toHaveBeenCalled()

    const countInput = screen.getByLabelText('Default number of positions')
    fireEvent.change(countInput, { target: { value: '6' } })
    fireEvent.blur(countInput)

    await waitFor(() =>
      expect(mockedApi.saveProcessOutputCapture).toHaveBeenCalledWith(1, {
        capture_mode: 'POSITION_LEVEL',
        position_label: 'Mould Position',
        default_position_count: 6,
        allow_work_centre_override: true,
        allow_different_sku_per_position: true,
      }),
    )
  })

  it('shows an Operator Screen Preview using the configured label and count', () => {
    render(
      <Step5OutputCaptureForm
        versionId={1}
        captureMode="POSITION_LEVEL"
        positionLabel="Packing Lane"
        defaultPositionCount={3}
        allowWorkCentreOverride={true}
        allowDifferentSkuPerPosition={true}
        onSaved={vi.fn()}
        onContinue={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByText('Operator Screen Preview'))

    expect(screen.getByText('Packing Lane 1')).toBeInTheDocument()
    expect(screen.getByText('Packing Lane 3')).toBeInTheDocument()
  })

  it('saves immediately when Allow Different SKU per Position is changed', async () => {
    mockedApi.saveProcessOutputCapture.mockResolvedValue(positionLevel)

    render(
      <Step5OutputCaptureForm
        versionId={1}
        captureMode="POSITION_LEVEL"
        positionLabel="Mould Position"
        defaultPositionCount={6}
        allowWorkCentreOverride={true}
        allowDifferentSkuPerPosition={true}
        onSaved={vi.fn()}
        onContinue={vi.fn()}
      />,
    )

    const skuGroup = screen.getByRole('radiogroup', {
      name: 'Can different positions produce different SKUs?',
    })
    fireEvent.click(within(skuGroup).getByRole('radio', { name: 'No' }))

    await waitFor(() => expect(mockedApi.saveProcessOutputCapture).toHaveBeenCalled())
  })

  it('calls onContinue when Save & Continue is clicked', () => {
    const onContinue = vi.fn()

    render(
      <Step5OutputCaptureForm
        versionId={1}
        captureMode="WORK_CENTRE_TOTAL"
        positionLabel=""
        defaultPositionCount={null}
        allowWorkCentreOverride={true}
        allowDifferentSkuPerPosition={true}
        onSaved={vi.fn()}
        onContinue={onContinue}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Save & Continue →' }))

    expect(onContinue).toHaveBeenCalled()
  })
})
