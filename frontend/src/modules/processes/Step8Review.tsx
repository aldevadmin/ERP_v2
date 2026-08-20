import { useState } from 'react'
import { Alert, Button, Flex, Tag, Typography } from 'antd'
import { Link } from 'react-router'
import { ApiError } from '../../shared/api/http'
import { activateProcess } from './api'
import {
  BATCH_LOT_MODE_OPTIONS,
  CAPTURE_MODE_OPTIONS,
  STANDARD_RATE_CONFIG_LEVEL_OPTIONS,
  TRANSACTION_FREQUENCY_OPTIONS,
  WORK_CENTRE_REQUIREMENT_OPTIONS,
} from './types'
import type { ActivationResult, CaptureMode, Process, ProcessWizardStepKey } from './types'

const { Text } = Typography

function labelFor(options: { value: string; label: string }[], value: string): string {
  return options.find((option) => option.value === value)?.label ?? '—'
}

function usesPositions(mode: CaptureMode | ''): boolean {
  return mode === 'POSITION_LEVEL' || mode === 'BOTH'
}

function ExecutionRow({ label, value }: { label: string; value: string }) {
  return (
    <Flex justify="space-between" style={{ padding: '6px 0', borderBottom: '1px solid #f5f5f5' }}>
      <Text type="secondary">{label}</Text>
      <Text strong>{value}</Text>
    </Flex>
  )
}

export default function Step8Review({
  process,
  onActivated,
  onEditStep,
}: {
  process: Process
  onActivated: (result: ActivationResult) => void
  onEditStep: (step: ProcessWizardStepKey) => void
}) {
  const [activating, setActivating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ActivationResult | null>(null)

  const handleActivate = async () => {
    setActivating(true)
    setError(null)
    try {
      const activationResult = await activateProcess(process.version_id)
      setResult(activationResult)
      onActivated(activationResult)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not activate this process.')
    } finally {
      setActivating(false)
    }
  }

  const outputCaptureLabel = usesPositions(process.capture_mode)
    ? `Per ${process.position_label || 'Position'}`
    : labelFor(CAPTURE_MODE_OPTIONS, process.capture_mode)

  const isActive = process.version_status === 'ACTIVE' || result !== null

  return (
    <>
      <Text strong style={{ display: 'block', marginBottom: 20, fontSize: 16 }}>
        Review &quot;{process.name}&quot; before activating
      </Text>

      <div style={{ marginBottom: 24, border: '1px solid #f0f0f0', borderRadius: 8, padding: 16 }}>
        <Flex justify="space-between" align="flex-start" gap={16}>
          <div style={{ flex: 1 }}>
            <Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>
              INPUTS
            </Text>
            {process.inputs.length === 0 ? (
              <Text type="secondary">None configured</Text>
            ) : (
              process.inputs.map((input) => (
                <div key={input.id}>
                  <Text>{input.item_label}</Text>
                </div>
              ))
            )}
          </div>
          <div
            style={{
              flex: 1,
              textAlign: 'center',
              alignSelf: 'center',
              background: '#f5f7ff',
              borderRadius: 6,
              padding: '12px 8px',
            }}
          >
            <Text strong style={{ textTransform: 'uppercase' }}>
              {process.name}
            </Text>
          </div>
          <div style={{ flex: 1, textAlign: 'right' }}>
            <Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>
              OUTPUTS
            </Text>
            {process.outputs.length === 0 ? (
              <Text type="secondary">None configured</Text>
            ) : (
              process.outputs.map((output) => (
                <div key={output.id}>
                  <Text>{output.item_label}</Text>{' '}
                  <Tag>{output.classification_name}</Tag>
                </div>
              ))
            )}
          </div>
        </Flex>
      </div>

      <div style={{ marginBottom: 24 }}>
        <Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>
          EXECUTION
        </Text>
        <ExecutionRow
          label="Work Centre"
          value={labelFor(WORK_CENTRE_REQUIREMENT_OPTIONS, process.work_centre_requirement)}
        />
        <ExecutionRow label="Operator" value={process.operator_required ? 'Required' : 'Not required'} />
        <ExecutionRow label="Output Capture" value={outputCaptureLabel} />
        {usesPositions(process.capture_mode) && (
          <>
            <ExecutionRow
              label="Default Positions"
              value={`${process.default_position_count ?? '—'}${
                process.allow_work_centre_override ? ' (work-centre override allowed)' : ' (fixed)'
              }`}
            />
            <ExecutionRow
              label="Different SKUs"
              value={
                process.allow_different_sku_per_position
                  ? 'Supported per position'
                  : 'Not supported'
              }
            />
          </>
        )}
        <ExecutionRow
          label="Standard Rate"
          value={labelFor(STANDARD_RATE_CONFIG_LEVEL_OPTIONS, process.standard_rate_config_level)}
        />
        <ExecutionRow
          label="Transaction"
          value={labelFor(TRANSACTION_FREQUENCY_OPTIONS, process.transaction_frequency)}
        />
        <ExecutionRow
          label="Batch Tracking"
          value={labelFor(BATCH_LOT_MODE_OPTIONS, process.batch_lot_mode)}
        />
      </div>

      <div style={{ marginBottom: 24 }}>
        <Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>
          PARAMETERS
        </Text>
        <Text>
          {process.parameters.length === 0
            ? 'No parameters configured'
            : process.parameters.map((parameter) => parameter.label).join(' • ')}
        </Text>
      </div>

      {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}

      {isActive && (
        <Alert
          type="success"
          showIcon
          style={{ marginBottom: 16 }}
          title="This process is active."
          description={
            <Flex vertical gap={4}>
              {(result?.warnings ?? []).map((warning) => (
                <Text key={warning}>{warning}</Text>
              ))}
              <Link to="/work-centres">Configure Work Centres →</Link>
            </Flex>
          }
        />
      )}

      <Flex justify="space-between">
        <Flex gap={8}>
          <Button onClick={() => onEditStep('inputs')}>← Edit Inputs</Button>
          <Button onClick={() => onEditStep('outputs')}>Edit Outputs</Button>
          <Button onClick={() => onEditStep('rules')}>Edit Rules</Button>
        </Flex>
        {!isActive && (
          <Button type="primary" loading={activating} onClick={() => void handleActivate()}>
            Save & Activate
          </Button>
        )}
      </Flex>
    </>
  )
}
