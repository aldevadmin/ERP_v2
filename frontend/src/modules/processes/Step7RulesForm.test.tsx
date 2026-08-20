import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import Step7RulesForm from './Step7RulesForm'
import * as processesApi from './api'

vi.mock('./api')

const mockedApi = vi.mocked(processesApi)

afterEach(() => {
  vi.clearAllMocks()
})

const baseProps = {
  versionId: 1,
  transactionFrequency: '' as const,
  batchLotMode: 'OPTIONAL' as const,
  partialOutputForward: true,
  allowOverProduction: false,
  overProductionTolerancePercent: null,
  inputConsumptionMode: 'MANUAL' as const,
  completionMode: 'OPERATOR' as const,
  qcRequirement: 'NONE' as const,
  allowCorrectionWithAuditTrail: true,
  allowDestructiveDelete: false,
  permitMachineGeneratedSource: true,
  onSaved: vi.fn(),
  onContinue: vi.fn(),
}

describe('Step7RulesForm', () => {
  it('shows the header question and section labels', () => {
    render(<Step7RulesForm {...baseProps} />)

    expect(screen.getByText('How should this process run?')).toBeInTheDocument()
    expect(screen.getByText('TRANSACTION FREQUENCY')).toBeInTheDocument()
    expect(screen.getByText('Batch / Lot tracking')).toBeInTheDocument()
    expect(screen.getByText('Advanced Rules')).toBeInTheDocument()
  })

  it('saves immediately when Transaction Frequency is picked', async () => {
    const onSaved = vi.fn()
    mockedApi.saveProcessRules.mockResolvedValue({
      transaction_frequency: 'SHIFT',
      batch_lot_mode: 'OPTIONAL',
      partial_output_forward: true,
      allow_over_production: false,
      over_production_tolerance_percent: null,
      input_consumption_mode: 'MANUAL',
      completion_mode: 'OPERATOR',
      qc_requirement: 'NONE',
      allow_correction_with_audit_trail: true,
      allow_destructive_delete: false,
      permit_machine_generated_source: true,
    })

    render(<Step7RulesForm {...baseProps} onSaved={onSaved} />)

    fireEvent.click(screen.getByRole('radio', { name: 'Shift based' }))

    await waitFor(() =>
      expect(mockedApi.saveProcessRules).toHaveBeenCalledWith(1, {
        transaction_frequency: 'SHIFT',
      }),
    )
    await waitFor(() =>
      expect(onSaved).toHaveBeenCalledWith(
        expect.objectContaining({ transaction_frequency: 'SHIFT' }),
      ),
    )
  })

  it('does not save over-production until a tolerance is entered and blurred', async () => {
    mockedApi.saveProcessRules.mockResolvedValue({
      transaction_frequency: 'MANUAL',
      batch_lot_mode: 'OPTIONAL',
      partial_output_forward: true,
      allow_over_production: true,
      over_production_tolerance_percent: 5,
      input_consumption_mode: 'MANUAL',
      completion_mode: 'OPERATOR',
      qc_requirement: 'NONE',
      allow_correction_with_audit_trail: true,
      allow_destructive_delete: false,
      permit_machine_generated_source: true,
    })

    render(<Step7RulesForm {...baseProps} />)

    const overProductionGroup = screen.getByRole('radiogroup', {
      name: 'Can output exceed the planned quantity?',
    })
    fireEvent.click(within(overProductionGroup).getByRole('radio', { name: 'Yes' }))

    expect(mockedApi.saveProcessRules).not.toHaveBeenCalled()

    const toleranceInput = screen.getByLabelText('Tolerance %')
    fireEvent.change(toleranceInput, { target: { value: '5' } })
    fireEvent.blur(toleranceInput)

    await waitFor(() =>
      expect(mockedApi.saveProcessRules).toHaveBeenCalledWith(1, {
        allow_over_production: true,
        over_production_tolerance_percent: 5,
      }),
    )
  })

  it('clears the tolerance immediately when over-production is turned off', async () => {
    render(<Step7RulesForm {...baseProps} allowOverProduction={true} overProductionTolerancePercent={5} />)

    const overProductionGroup = screen.getByRole('radiogroup', {
      name: 'Can output exceed the planned quantity?',
    })
    fireEvent.click(within(overProductionGroup).getByRole('radio', { name: 'No' }))

    await waitFor(() =>
      expect(mockedApi.saveProcessRules).toHaveBeenCalledWith(1, {
        allow_over_production: false,
        over_production_tolerance_percent: null,
      }),
    )
  })

  it('saves immediately when an Advanced Rules checkbox is toggled', async () => {
    mockedApi.saveProcessRules.mockResolvedValue({
      transaction_frequency: 'MANUAL',
      batch_lot_mode: 'OPTIONAL',
      partial_output_forward: true,
      allow_over_production: false,
      over_production_tolerance_percent: null,
      input_consumption_mode: 'MANUAL',
      completion_mode: 'OPERATOR',
      qc_requirement: 'NONE',
      allow_correction_with_audit_trail: true,
      allow_destructive_delete: true,
      permit_machine_generated_source: true,
    })

    render(<Step7RulesForm {...baseProps} />)

    fireEvent.click(screen.getByText('Advanced Rules'))
    fireEvent.click(await screen.findByText('Allow destructive delete'))

    await waitFor(() =>
      expect(mockedApi.saveProcessRules).toHaveBeenCalledWith(1, {
        allow_destructive_delete: true,
      }),
    )
  })

  it('calls onContinue when Save & Continue is clicked', () => {
    const onContinue = vi.fn()

    render(<Step7RulesForm {...baseProps} onContinue={onContinue} />)

    fireEvent.click(screen.getByRole('button', { name: 'Save & Continue →' }))

    expect(onContinue).toHaveBeenCalled()
  })
})
