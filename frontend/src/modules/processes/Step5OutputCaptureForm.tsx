import { useEffect, useState } from 'react'
import { Alert, Button, Collapse, Flex, Input, InputNumber, Radio, Table, Typography } from 'antd'
import { ApiError } from '../../shared/api/http'
import { saveProcessOutputCapture } from './api'
import { CAPTURE_MODE_OPTIONS } from './types'
import type { CaptureMode, ProcessOutputCaptureFormValues } from './types'

const { Text } = Typography

function usesPositions(mode: CaptureMode | ''): boolean {
  return mode === 'POSITION_LEVEL' || mode === 'BOTH'
}

export default function Step5OutputCaptureForm({
  versionId,
  captureMode,
  positionLabel,
  defaultPositionCount,
  allowWorkCentreOverride,
  allowDifferentSkuPerPosition,
  onSaved,
  onContinue,
}: {
  versionId: number
  captureMode: CaptureMode | ''
  positionLabel: string
  defaultPositionCount: number | null
  allowWorkCentreOverride: boolean
  allowDifferentSkuPerPosition: boolean
  onSaved: (values: ProcessOutputCaptureFormValues) => void
  onContinue: () => void
}) {
  const [local, setLocal] = useState<{ captureMode: CaptureMode | ''; positionLabel: string; defaultPositionCount: number | null }>({
    captureMode,
    positionLabel,
    defaultPositionCount,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLocal({ captureMode, positionLabel, defaultPositionCount })
  }, [captureMode, positionLabel, defaultPositionCount])

  const persist = async (values: ProcessOutputCaptureFormValues) => {
    setSaving(true)
    setError(null)
    try {
      const result = await saveProcessOutputCapture(versionId, values)
      onSaved(result)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this step.')
    } finally {
      setSaving(false)
    }
  }

  const handleCaptureModeChange = (mode: CaptureMode) => {
    setLocal((prev) => ({ ...prev, captureMode: mode }))
    if (!usesPositions(mode)) {
      void persist({
        capture_mode: mode,
        position_label: '',
        default_position_count: null,
        allow_work_centre_override: allowWorkCentreOverride,
        allow_different_sku_per_position: allowDifferentSkuPerPosition,
      })
      return
    }
    if (local.positionLabel && local.defaultPositionCount) {
      void persist({
        capture_mode: mode,
        position_label: local.positionLabel,
        default_position_count: local.defaultPositionCount,
        allow_work_centre_override: allowWorkCentreOverride,
        allow_different_sku_per_position: allowDifferentSkuPerPosition,
      })
    }
  }

  const handlePositionFieldsBlur = () => {
    if (!usesPositions(local.captureMode) || local.captureMode === '') return
    if (!local.positionLabel || !local.defaultPositionCount) return
    void persist({
      capture_mode: local.captureMode,
      position_label: local.positionLabel,
      default_position_count: local.defaultPositionCount,
      allow_work_centre_override: allowWorkCentreOverride,
      allow_different_sku_per_position: allowDifferentSkuPerPosition,
    })
  }

  const handleBooleanChange = (
    field: 'allow_work_centre_override' | 'allow_different_sku_per_position',
    value: boolean,
  ) => {
    if (usesPositions(local.captureMode) && (!local.positionLabel || !local.defaultPositionCount)) {
      // Conditional fields still incomplete — nothing valid to save yet.
      return
    }
    void persist({
      capture_mode: local.captureMode || 'WORK_CENTRE_TOTAL',
      position_label: local.positionLabel,
      default_position_count: local.defaultPositionCount,
      allow_work_centre_override: field === 'allow_work_centre_override' ? value : allowWorkCentreOverride,
      allow_different_sku_per_position:
        field === 'allow_different_sku_per_position' ? value : allowDifferentSkuPerPosition,
    })
  }

  const showPositionFields = usesPositions(local.captureMode)
  const previewCount =
    showPositionFields && local.defaultPositionCount ? local.defaultPositionCount : 0
  const previewLabel = local.positionLabel || 'Position'
  const previewRows = Array.from({ length: previewCount }, (_, i) => ({
    key: i + 1,
    position: `${previewLabel} ${i + 1}`,
    tooling: '—',
    sku: '—',
    good: '',
    reject: '',
  }))

  return (
    <>
      <Text strong style={{ display: 'block', marginBottom: 20, fontSize: 16 }}>
        How should output be recorded?
      </Text>
      {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}

      <div style={{ marginBottom: 24 }}>
        <Radio.Group
          value={local.captureMode || undefined}
          onChange={(e) => handleCaptureModeChange(e.target.value as CaptureMode)}
        >
          <Flex vertical gap={8}>
            {CAPTURE_MODE_OPTIONS.map((option) => (
              <Radio key={option.value} value={option.value}>
                {option.label}
              </Radio>
            ))}
          </Flex>
        </Radio.Group>
      </div>

      {showPositionFields && (
        <>
          <div style={{ marginBottom: 24 }}>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>
              What should these positions be called in this UI?
            </Text>
            <Input
              aria-label="What should these positions be called in this UI?"
              value={local.positionLabel}
              placeholder="e.g. Mould Position, Packing Lane"
              style={{ maxWidth: 320 }}
              onChange={(e) => setLocal((prev) => ({ ...prev, positionLabel: e.target.value }))}
              onBlur={handlePositionFieldsBlur}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>
              Default number of positions
            </Text>
            <InputNumber
              aria-label="Default number of positions"
              min={1}
              value={local.defaultPositionCount ?? undefined}
              style={{ maxWidth: 160 }}
              onChange={(value) =>
                setLocal((prev) => ({ ...prev, defaultPositionCount: value ?? null }))
              }
              onBlur={handlePositionFieldsBlur}
            />
          </div>
        </>
      )}

      <div style={{ marginBottom: 24 }}>
        <Text strong style={{ display: 'block', marginBottom: 8 }}>
          Can each work centre override the position count?
        </Text>
        <Radio.Group
          aria-label="Can each work centre override the position count?"
          value={allowWorkCentreOverride}
          onChange={(e) => handleBooleanChange('allow_work_centre_override', e.target.value as boolean)}
        >
          <Radio value={true}>Yes</Radio>
          <Radio value={false}>No</Radio>
        </Radio.Group>
      </div>

      <div style={{ marginBottom: 24 }}>
        <Text strong style={{ display: 'block', marginBottom: 8 }}>
          Can different positions produce different SKUs?
        </Text>
        <Radio.Group
          aria-label="Can different positions produce different SKUs?"
          value={allowDifferentSkuPerPosition}
          onChange={(e) =>
            handleBooleanChange('allow_different_sku_per_position', e.target.value as boolean)
          }
        >
          <Radio value={true}>Yes</Radio>
          <Radio value={false}>No</Radio>
        </Radio.Group>
      </div>

      {showPositionFields && previewCount > 0 && (
        <Collapse
          style={{ marginBottom: 24 }}
          items={[
            {
              key: 'preview',
              label: 'Operator Screen Preview',
              children: (
                <Table
                  size="small"
                  pagination={false}
                  dataSource={previewRows}
                  columns={[
                    { title: previewLabel, dataIndex: 'position', key: 'position' },
                    { title: 'Tooling', dataIndex: 'tooling', key: 'tooling' },
                    { title: 'SKU', dataIndex: 'sku', key: 'sku' },
                    { title: 'Good Output', dataIndex: 'good', key: 'good' },
                    { title: 'Reject', dataIndex: 'reject', key: 'reject' },
                  ]}
                />
              ),
            },
          ]}
        />
      )}

      <Flex justify="end">
        <Button type="primary" loading={saving} onClick={onContinue}>
          Save & Continue →
        </Button>
      </Flex>
    </>
  )
}
