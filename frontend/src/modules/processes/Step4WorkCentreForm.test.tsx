import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import Step4WorkCentreForm from './Step4WorkCentreForm'
import * as processesApi from './api'
import type { ProcessWorkCentreFormValues } from './types'

vi.mock('./api')

const mockedApi = vi.mocked(processesApi)

afterEach(() => {
  vi.clearAllMocks()
})

const savedValues: ProcessWorkCentreFormValues = {
  work_centre_requirement: 'MACHINE',
  operator_required: true,
  standard_rate_config_level: 'WORK_CENTRE',
}

describe('Step4WorkCentreForm', () => {
  it('shows the header question and all radio options', () => {
    render(
      <Step4WorkCentreForm
        processName="Pressing"
        versionId={1}
        workCentreRequirement=""
        operatorRequired={true}
        standardRateConfigLevel=""
        onSaved={vi.fn()}
        onContinue={vi.fn()}
      />,
    )

    expect(screen.getByText('Where does "Pressing" happen?')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Machine' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Machine or Station' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'No work centre required' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Process level' })).toBeInTheDocument()
  })

  it('saves immediately when Work Centre Requirement is changed', async () => {
    mockedApi.saveProcessWorkCentre.mockResolvedValue(savedValues)

    render(
      <Step4WorkCentreForm
        processName="Pressing"
        versionId={1}
        workCentreRequirement=""
        operatorRequired={true}
        standardRateConfigLevel=""
        onSaved={vi.fn()}
        onContinue={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('radio', { name: 'Machine' }))

    await waitFor(() =>
      expect(mockedApi.saveProcessWorkCentre).toHaveBeenCalledWith(1, {
        work_centre_requirement: 'MACHINE',
      }),
    )
  })

  it('saves immediately when Operator Required is changed', async () => {
    mockedApi.saveProcessWorkCentre.mockResolvedValue(savedValues)
    const onSaved = vi.fn()

    render(
      <Step4WorkCentreForm
        processName="Pressing"
        versionId={1}
        workCentreRequirement="MACHINE"
        operatorRequired={true}
        standardRateConfigLevel="WORK_CENTRE"
        onSaved={onSaved}
        onContinue={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('radio', { name: 'No' }))

    await waitFor(() =>
      expect(mockedApi.saveProcessWorkCentre).toHaveBeenCalledWith(1, {
        operator_required: false,
      }),
    )
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(savedValues))
  })

  it('saves immediately when Standard Rate Configuration Level is changed', async () => {
    mockedApi.saveProcessWorkCentre.mockResolvedValue(savedValues)

    render(
      <Step4WorkCentreForm
        processName="Pressing"
        versionId={1}
        workCentreRequirement="MACHINE"
        operatorRequired={true}
        standardRateConfigLevel=""
        onSaved={vi.fn()}
        onContinue={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('radio', { name: 'Work Centre level' }))

    await waitFor(() =>
      expect(mockedApi.saveProcessWorkCentre).toHaveBeenCalledWith(1, {
        standard_rate_config_level: 'WORK_CENTRE',
      }),
    )
  })

  it('calls onContinue when Save & Continue is clicked', () => {
    const onContinue = vi.fn()

    render(
      <Step4WorkCentreForm
        processName="Pressing"
        versionId={1}
        workCentreRequirement="MACHINE"
        operatorRequired={true}
        standardRateConfigLevel="WORK_CENTRE"
        onSaved={vi.fn()}
        onContinue={onContinue}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Save & Continue →' }))

    expect(onContinue).toHaveBeenCalled()
  })
})
