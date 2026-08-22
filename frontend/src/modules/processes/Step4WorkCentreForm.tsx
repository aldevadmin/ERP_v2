import { useState } from 'react'
import { Alert, Button, Flex, Radio, Typography } from 'antd'
import LabelWithHint from '../../shared/components/LabelWithHint'
import { ApiError } from '../../shared/api/http'
import { saveProcessWorkCentre } from './api'
import {
  STANDARD_RATE_CONFIG_LEVEL_OPTIONS,
  WORK_CENTRE_REQUIREMENT_OPTIONS,
} from './types'
import type {
  ProcessWorkCentreFormValues,
  StandardRateConfigLevel,
  WorkCentreRequirement,
} from './types'

const { Text } = Typography

export default function Step4WorkCentreForm({
  processName,
  versionId,
  workCentreRequirement,
  operatorRequired,
  standardRateConfigLevel,
  onSaved,
  onContinue,
}: {
  processName: string
  versionId: number
  workCentreRequirement: WorkCentreRequirement | ''
  operatorRequired: boolean
  standardRateConfigLevel: StandardRateConfigLevel | ''
  onSaved: (values: ProcessWorkCentreFormValues) => void
  onContinue: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleChange = async (partial: Partial<ProcessWorkCentreFormValues>) => {
    setSaving(true)
    setError(null)
    try {
      const result = await saveProcessWorkCentre(versionId, partial)
      onSaved(result)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this step.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Text strong style={{ display: 'block', marginBottom: 20, fontSize: 16 }}>
        Where does &quot;{processName}&quot; happen?
      </Text>
      {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}

      <div style={{ marginBottom: 24 }}>
        <Radio.Group
          value={workCentreRequirement || undefined}
          onChange={(e) =>
            void handleChange({ work_centre_requirement: e.target.value as WorkCentreRequirement })
          }
        >
          <Flex vertical gap={8}>
            {WORK_CENTRE_REQUIREMENT_OPTIONS.map((option) => (
              <Radio key={option.value} value={option.value}>
                {option.label}
              </Radio>
            ))}
          </Flex>
        </Radio.Group>
      </div>

      <div style={{ marginBottom: 24 }}>
        <Text strong style={{ display: 'block', marginBottom: 8 }}>
          Is an operator required?
        </Text>
        <Radio.Group
          value={operatorRequired}
          onChange={(e) => void handleChange({ operator_required: e.target.value as boolean })}
        >
          <Radio value={true}>Yes</Radio>
          <Radio value={false}>No</Radio>
        </Radio.Group>
      </div>

      <div style={{ marginBottom: 24 }}>
        <LabelWithHint
          text="Where should Standard Output / Hour be configured?"
          hint="Decides where the expected output rate for this process is set — at the Process level (one rate for everyone), the Work Centre level (per machine/station), or the Tooling / Position level (per mould or tool)."
        />
        <Radio.Group
          value={standardRateConfigLevel || undefined}
          onChange={(e) =>
            void handleChange({
              standard_rate_config_level: e.target.value as StandardRateConfigLevel,
            })
          }
        >
          <Flex vertical gap={8}>
            {STANDARD_RATE_CONFIG_LEVEL_OPTIONS.map((option) => (
              <Radio key={option.value} value={option.value}>
                {option.label}
              </Radio>
            ))}
          </Flex>
        </Radio.Group>
      </div>

      <Flex justify="end">
        <Button type="primary" loading={saving} onClick={onContinue}>
          Save & Continue →
        </Button>
      </Flex>
    </>
  )
}
