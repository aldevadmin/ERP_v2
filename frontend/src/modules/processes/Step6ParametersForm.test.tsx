import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import Step6ParametersForm from './Step6ParametersForm'
import * as processesApi from './api'
import type { ProcessParameter } from './types'

vi.mock('./api')

const mockedApi = vi.mocked(processesApi)

afterEach(() => {
  vi.clearAllMocks()
})

const temperature: ProcessParameter = {
  id: 1,
  sequence: 1,
  label: 'Temperature',
  code: 'TEMPERATURE',
  data_type: 'NUMBER',
  unit: '°C',
  capture_at: 'START',
  is_required: true,
  default_value: '',
}

describe('Step6ParametersForm', () => {
  it('shows the header question and existing parameter rows', () => {
    render(
      <Step6ParametersForm
        versionId={1}
        parameters={[temperature]}
        allowManualStandardRate={true}
        reserveMachineDerivedRate={true}
        onParametersSaved={vi.fn()}
        onPerformanceSaved={vi.fn()}
        onContinue={vi.fn()}
      />,
    )

    expect(screen.getByText('What else should be configured or recorded?')).toBeInTheDocument()
    expect(screen.getByText('Temperature')).toBeInTheDocument()
    expect(screen.getByText('Number')).toBeInTheDocument()
    expect(screen.getByText('Start')).toBeInTheDocument()
  })

  it('adds a parameter, auto-generating the code from the label, and saves the whole list', async () => {
    const onParametersSaved = vi.fn()
    mockedApi.saveProcessParameters.mockResolvedValue([temperature])

    render(
      <Step6ParametersForm
        versionId={1}
        parameters={[]}
        allowManualStandardRate={true}
        reserveMachineDerivedRate={true}
        onParametersSaved={onParametersSaved}
        onPerformanceSaved={vi.fn()}
        onContinue={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByText('+ Add Parameter'))
    const dialog = await screen.findByRole('dialog')

    fireEvent.change(within(dialog).getByLabelText('Label'), {
      target: { value: 'Temperature' },
    })
    expect(within(dialog).getByLabelText('Code')).toHaveValue('TEMPERATURE')

    fireEvent.mouseDown(within(dialog).getByLabelText('Data Type'))
    const dataTypeOptions = await screen.findAllByText('Number')
    fireEvent.click(dataTypeOptions[dataTypeOptions.length - 1])

    fireEvent.mouseDown(within(dialog).getByLabelText('Capture At'))
    const captureAtOptions = await screen.findAllByText('Start')
    fireEvent.click(captureAtOptions[captureAtOptions.length - 1])

    fireEvent.click(within(dialog).getByRole('button', { name: 'Add' }))

    await waitFor(() =>
      expect(mockedApi.saveProcessParameters).toHaveBeenCalledWith(1, {
        parameters: [
          expect.objectContaining({
            label: 'Temperature',
            code: 'TEMPERATURE',
            data_type: 'NUMBER',
            capture_at: 'START',
          }),
        ],
      }),
    )
    await waitFor(() => expect(onParametersSaved).toHaveBeenCalledWith([temperature]))
  })

  it('deletes a parameter', async () => {
    mockedApi.saveProcessParameters.mockResolvedValue([])

    render(
      <Step6ParametersForm
        versionId={1}
        parameters={[temperature]}
        allowManualStandardRate={true}
        reserveMachineDerivedRate={true}
        onParametersSaved={vi.fn()}
        onPerformanceSaved={vi.fn()}
        onContinue={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByLabelText('Delete Temperature'))

    await waitFor(() =>
      expect(mockedApi.saveProcessParameters).toHaveBeenCalledWith(1, { parameters: [] }),
    )
  })

  it('saves immediately when a PERFORMANCE checkbox is toggled', async () => {
    const onPerformanceSaved = vi.fn()
    mockedApi.saveProcessPerformance.mockResolvedValue({
      allow_manual_standard_rate: false,
      reserve_machine_derived_rate: true,
    })

    render(
      <Step6ParametersForm
        versionId={1}
        parameters={[]}
        allowManualStandardRate={true}
        reserveMachineDerivedRate={true}
        onParametersSaved={vi.fn()}
        onPerformanceSaved={onPerformanceSaved}
        onContinue={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByText('Allow manually configured Standard Output / Hour'))

    await waitFor(() =>
      expect(mockedApi.saveProcessPerformance).toHaveBeenCalledWith(1, {
        allow_manual_standard_rate: false,
      }),
    )
    await waitFor(() =>
      expect(onPerformanceSaved).toHaveBeenCalledWith({
        allow_manual_standard_rate: false,
        reserve_machine_derived_rate: true,
      }),
    )
  })

  it('calls onContinue when Save & Continue is clicked', () => {
    const onContinue = vi.fn()

    render(
      <Step6ParametersForm
        versionId={1}
        parameters={[temperature]}
        allowManualStandardRate={true}
        reserveMachineDerivedRate={true}
        onParametersSaved={vi.fn()}
        onPerformanceSaved={vi.fn()}
        onContinue={onContinue}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Save & Continue →' }))

    expect(onContinue).toHaveBeenCalled()
  })
})
