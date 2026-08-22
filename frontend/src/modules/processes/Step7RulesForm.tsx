import { useEffect, useState } from 'react'
import { Alert, Button, Checkbox, Collapse, Flex, InputNumber, Radio, Tooltip, Typography } from 'antd'
import { InfoCircleOutlined } from '@ant-design/icons'
import LabelWithHint from '../../shared/components/LabelWithHint'
import { ApiError } from '../../shared/api/http'
import { saveProcessRules } from './api'
import {
  BATCH_LOT_MODE_OPTIONS,
  COMPLETION_MODE_OPTIONS,
  INPUT_CONSUMPTION_MODE_OPTIONS,
  QC_REQUIREMENT_OPTIONS,
  TRANSACTION_FREQUENCY_OPTIONS,
} from './types'
import type {
  BatchLotMode,
  CompletionMode,
  InputConsumptionMode,
  ProcessRulesFormValues,
  QcRequirement,
  TransactionFrequency,
} from './types'

const { Text } = Typography

export default function Step7RulesForm({
  versionId,
  transactionFrequency,
  batchLotMode,
  partialOutputForward,
  allowOverProduction,
  overProductionTolerancePercent,
  inputConsumptionMode,
  completionMode,
  qcRequirement,
  allowCorrectionWithAuditTrail,
  allowDestructiveDelete,
  permitMachineGeneratedSource,
  onSaved,
  onContinue,
}: {
  versionId: number
  transactionFrequency: TransactionFrequency | ''
  batchLotMode: BatchLotMode
  partialOutputForward: boolean
  allowOverProduction: boolean
  overProductionTolerancePercent: number | null
  inputConsumptionMode: InputConsumptionMode
  completionMode: CompletionMode
  qcRequirement: QcRequirement
  allowCorrectionWithAuditTrail: boolean
  allowDestructiveDelete: boolean
  permitMachineGeneratedSource: boolean
  onSaved: (values: Partial<ProcessRulesFormValues>) => void
  onContinue: () => void
}) {
  const [overProductionLocal, setOverProductionLocal] = useState(allowOverProduction)
  const [tolerance, setTolerance] = useState<number | null>(overProductionTolerancePercent)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setOverProductionLocal(allowOverProduction)
  }, [allowOverProduction])

  useEffect(() => {
    setTolerance(overProductionTolerancePercent)
  }, [overProductionTolerancePercent])

  const persist = async (partial: Partial<ProcessRulesFormValues>) => {
    setSaving(true)
    setError(null)
    try {
      const result = await saveProcessRules(versionId, partial)
      onSaved(result)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this step.')
    } finally {
      setSaving(false)
    }
  }

  const handleOverProductionChange = (value: boolean) => {
    setOverProductionLocal(value)
    if (!value) {
      void persist({ allow_over_production: false, over_production_tolerance_percent: null })
      return
    }
    if (tolerance !== null) {
      void persist({ allow_over_production: true, over_production_tolerance_percent: tolerance })
    }
  }

  const handleToleranceBlur = () => {
    if (!overProductionLocal || tolerance === null) return
    void persist({ allow_over_production: true, over_production_tolerance_percent: tolerance })
  }

  return (
    <>
      <Text strong style={{ display: 'block', marginBottom: 20, fontSize: 16 }}>
        How should this process run?
      </Text>
      {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}

      <div style={{ marginBottom: 24 }}>
        <Text type="secondary" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: 12 }}>
          TRANSACTION FREQUENCY
          <Tooltip title="How often a production record gets created for this process — e.g. once per shift, once per batch, or driven by manual entries.">
            <InfoCircleOutlined style={{ color: '#8c8c8c', fontSize: 13 }} />
          </Tooltip>
        </Text>
        <Radio.Group
          value={transactionFrequency || undefined}
          onChange={(e) =>
            void persist({ transaction_frequency: e.target.value as TransactionFrequency })
          }
        >
          <Flex vertical gap={8}>
            {TRANSACTION_FREQUENCY_OPTIONS.map((option) => (
              <Radio key={option.value} value={option.value}>
                {option.label}
              </Radio>
            ))}
          </Flex>
        </Radio.Group>
      </div>

      <div style={{ marginBottom: 24 }}>
        <Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>
          TRACEABILITY
        </Text>
        <Text strong style={{ display: 'block', marginBottom: 8 }}>
          Batch / Lot tracking
        </Text>
        <Radio.Group
          value={batchLotMode}
          onChange={(e) => void persist({ batch_lot_mode: e.target.value as BatchLotMode })}
        >
          <Flex vertical gap={8}>
            {BATCH_LOT_MODE_OPTIONS.map((option) => (
              <Radio key={option.value} value={option.value}>
                {option.label}
              </Radio>
            ))}
          </Flex>
        </Radio.Group>
      </div>

      <div style={{ marginBottom: 24 }}>
        <Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>
          FLOW
        </Text>
        <Text strong style={{ display: 'block', marginBottom: 8 }}>
          Can downstream work start before this process is fully complete?
        </Text>
        <Radio.Group
          aria-label="Can downstream work start before this process is fully complete?"
          value={partialOutputForward}
          onChange={(e) => void persist({ partial_output_forward: e.target.value as boolean })}
        >
          <Radio value={true}>Yes</Radio>
          <Radio value={false}>No</Radio>
        </Radio.Group>
      </div>

      <div style={{ marginBottom: 24 }}>
        <Text strong style={{ display: 'block', marginBottom: 8 }}>
          Can output exceed the planned quantity?
        </Text>
        <Flex align="center" gap={16}>
          <Radio.Group
            aria-label="Can output exceed the planned quantity?"
            value={overProductionLocal}
            onChange={(e) => handleOverProductionChange(e.target.value as boolean)}
          >
            <Radio value={true}>Yes</Radio>
            <Radio value={false}>No</Radio>
          </Radio.Group>
          {overProductionLocal && (
            <InputNumber
              aria-label="Tolerance %"
              min={0}
              max={100}
              value={tolerance ?? undefined}
              addonAfter="%"
              style={{ width: 120 }}
              onChange={(value) => setTolerance(value ?? null)}
              onBlur={handleToleranceBlur}
            />
          )}
        </Flex>
      </div>

      <Collapse
        style={{ marginBottom: 24 }}
        items={[
          {
            key: 'advanced',
            label: 'Advanced Rules',
            children: (
              <>
                <div style={{ marginBottom: 24 }}>
                  <LabelWithHint
                    text="Input Consumption"
                    hint="How raw material and input quantities get recorded when this process runs — entered manually, calculated by formula, or reserved from a future inventory integration."
                  />
                  <Radio.Group
                    value={inputConsumptionMode}
                    onChange={(e) =>
                      void persist({
                        input_consumption_mode: e.target.value as InputConsumptionMode,
                      })
                    }
                  >
                    <Flex vertical gap={8}>
                      {INPUT_CONSUMPTION_MODE_OPTIONS.map((option) => (
                        <Radio key={option.value} value={option.value}>
                          {option.label}
                        </Radio>
                      ))}
                    </Flex>
                  </Radio.Group>
                </div>

                <div style={{ marginBottom: 24 }}>
                  <Text strong style={{ display: 'block', marginBottom: 8 }}>
                    Completion
                  </Text>
                  <Radio.Group
                    value={completionMode}
                    onChange={(e) =>
                      void persist({ completion_mode: e.target.value as CompletionMode })
                    }
                  >
                    <Flex vertical gap={8}>
                      {COMPLETION_MODE_OPTIONS.map((option) => (
                        <Radio key={option.value} value={option.value}>
                          {option.label}
                        </Radio>
                      ))}
                    </Flex>
                  </Radio.Group>
                </div>

                <div style={{ marginBottom: 24 }}>
                  <Text strong style={{ display: 'block', marginBottom: 8 }}>
                    QC requirement
                  </Text>
                  <Radio.Group
                    value={qcRequirement}
                    onChange={(e) =>
                      void persist({ qc_requirement: e.target.value as QcRequirement })
                    }
                  >
                    <Flex vertical gap={8}>
                      {QC_REQUIREMENT_OPTIONS.map((option) => (
                        <Radio key={option.value} value={option.value}>
                          {option.label}
                        </Radio>
                      ))}
                    </Flex>
                  </Radio.Group>
                </div>

                <Flex vertical gap={8}>
                  <Checkbox
                    checked={allowCorrectionWithAuditTrail}
                    onChange={(e) =>
                      void persist({ allow_correction_with_audit_trail: e.target.checked })
                    }
                  >
                    Allow correction with audit trail{' '}
                    <Tooltip title="Lets a recorded transaction for this process be corrected after the fact, keeping a record of what changed and who changed it.">
                      <InfoCircleOutlined style={{ color: '#8c8c8c', fontSize: 13 }} />
                    </Tooltip>
                  </Checkbox>
                  <Checkbox
                    checked={allowDestructiveDelete}
                    onChange={(e) =>
                      void persist({ allow_destructive_delete: e.target.checked })
                    }
                  >
                    Allow destructive delete{' '}
                    <Tooltip title="Lets a recorded transaction for this process be permanently deleted rather than only corrected. Leave off to preserve full history.">
                      <InfoCircleOutlined style={{ color: '#8c8c8c', fontSize: 13 }} />
                    </Tooltip>
                  </Checkbox>
                  <Checkbox
                    checked={permitMachineGeneratedSource}
                    onChange={(e) =>
                      void persist({ permit_machine_generated_source: e.target.checked })
                    }
                  >
                    Permit machine-generated execution / output source{' '}
                    <Tooltip title="Allows this process's records to be created automatically by a connected machine, not only entered by an operator.">
                      <InfoCircleOutlined style={{ color: '#8c8c8c', fontSize: 13 }} />
                    </Tooltip>
                  </Checkbox>
                </Flex>
              </>
            ),
          },
        ]}
      />

      <Flex justify="end">
        <Button type="primary" loading={saving} onClick={onContinue}>
          Save & Continue →
        </Button>
      </Flex>
    </>
  )
}
