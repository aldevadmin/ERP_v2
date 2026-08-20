import { useState } from 'react'
import { Alert, Button, Flex, Radio, Typography } from 'antd'
import { DeleteOutlined, EditOutlined } from '@ant-design/icons'
import { ApiError } from '../../shared/api/http'
import InputEditorModal from './InputEditorModal'
import { saveProcessInputs } from './api'
import { BATCH_LOT_MODE_OPTIONS, INPUT_TYPE_OPTIONS, QUANTITY_CAPTURE_OPTIONS } from './types'
import type { BatchLotMode, ProcessInput, ProcessInputFormValues } from './types'

const { Text } = Typography

function labelFor(options: { value: string; label: string }[], value: string): string {
  return options.find((option) => option.value === value)?.label ?? value
}

function toFormValues(rows: ProcessInput[]): ProcessInputFormValues[] {
  return rows.map((row) => ({
    id: row.id,
    input_type: row.input_type,
    item: row.item_id,
    uom: row.uom,
    quantity_capture: row.quantity_capture,
    is_required: row.is_required,
  }))
}

export default function Step2InputsForm({
  processName,
  versionId,
  inputs,
  batchLotMode,
  onSaved,
  onContinue,
}: {
  processName: string
  versionId: number
  inputs: ProcessInput[]
  batchLotMode: BatchLotMode
  onSaved: (result: { inputs: ProcessInput[]; batch_lot_mode: BatchLotMode }) => void
  onContinue: () => void
}) {
  const [editingInput, setEditingInput] = useState<ProcessInput | 'new' | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const persist = async (nextInputs: ProcessInputFormValues[], nextBatchLotMode: BatchLotMode) => {
    setSaving(true)
    setError(null)
    try {
      const result = await saveProcessInputs(versionId, {
        inputs: nextInputs,
        batch_lot_mode: nextBatchLotMode,
      })
      onSaved(result)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save inputs.')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveInput = async (values: ProcessInputFormValues) => {
    const nextValues = toFormValues(inputs)
    const existingIndex =
      editingInput && editingInput !== 'new'
        ? inputs.findIndex((row) => row.id === editingInput.id)
        : -1
    if (existingIndex >= 0) {
      nextValues[existingIndex] = values
    } else {
      nextValues.push(values)
    }
    await persist(nextValues, batchLotMode)
    setEditingInput(null)
  }

  const handleDelete = (input: ProcessInput) => {
    const nextValues = toFormValues(inputs).filter((row) => row.id !== input.id)
    void persist(nextValues, batchLotMode)
  }

  const handleBatchLotModeChange = (value: BatchLotMode) => {
    void persist(toFormValues(inputs), value)
  }

  return (
    <>
      <Text strong style={{ display: 'block', marginBottom: 20, fontSize: 16 }}>
        What does &quot;{processName}&quot; receive or consume?
      </Text>
      {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}

      <Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>
        INPUTS
      </Text>
      <Flex vertical gap={8} style={{ marginBottom: 16 }}>
        {inputs.length === 0 && <Text type="secondary">No inputs added yet.</Text>}
        {inputs.map((input, index) => (
          <div
            key={input.id}
            style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: '12px 16px' }}
          >
            <Flex justify="space-between" align="start">
              <div>
                <Text strong>
                  {index + 1} {input.item_label}
                </Text>
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Type: {labelFor(INPUT_TYPE_OPTIONS, input.input_type)}
                  </Text>
                </div>
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    UOM: {input.uom}
                  </Text>
                </div>
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Qty Capture: {labelFor(QUANTITY_CAPTURE_OPTIONS, input.quantity_capture)}
                  </Text>
                </div>
              </div>
              <Flex gap={8}>
                <Button size="small" icon={<EditOutlined />} onClick={() => setEditingInput(input)}>
                  Edit
                </Button>
                <Button
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  aria-label={`Delete ${input.item_label}`}
                  onClick={() => handleDelete(input)}
                />
              </Flex>
            </Flex>
          </div>
        ))}
      </Flex>
      <Button onClick={() => setEditingInput('new')} style={{ marginBottom: 24 }}>
        + Add Input
      </Button>

      <div style={{ marginBottom: 24 }}>
        <Text strong style={{ display: 'block', marginBottom: 8 }}>
          Batch / Lot traceability
        </Text>
        <Radio.Group
          value={batchLotMode}
          onChange={(e) => handleBatchLotModeChange(e.target.value as BatchLotMode)}
        >
          {BATCH_LOT_MODE_OPTIONS.map((option) => (
            <Radio key={option.value} value={option.value}>
              {option.label}
            </Radio>
          ))}
        </Radio.Group>
      </div>

      <Flex justify="end">
        <Button type="primary" loading={saving} onClick={onContinue}>
          Save & Continue →
        </Button>
      </Flex>

      <InputEditorModal
        open={editingInput !== null}
        input={editingInput === 'new' ? null : editingInput}
        onClose={() => setEditingInput(null)}
        onSave={handleSaveInput}
      />
    </>
  )
}
