import { useState } from 'react'
import { Alert, Button, Flex, Typography } from 'antd'
import { DeleteOutlined, EditOutlined } from '@ant-design/icons'
import { ApiError } from '../../shared/api/http'
import InputEditorModalV1 from './InputEditorModalV1'
import { saveProcessInputsV1 } from './api'
import type { ProcessInputV1, ProcessInputV1FormValues } from './types'

const { Text } = Typography

function toFormValues(rows: ProcessInputV1[]): ProcessInputV1FormValues[] {
  return rows.map((row) => ({
    id: row.id,
    item_group: row.item_group,
    uom: row.uom,
    is_required: row.is_required,
  }))
}

export default function Step2InputsFormV1({
  processName,
  versionId,
  inputs,
  onSaved,
  onContinue,
}: {
  processName: string
  versionId: number
  inputs: ProcessInputV1[]
  onSaved: (inputs: ProcessInputV1[]) => void
  onContinue: () => void
}) {
  const [editingInput, setEditingInput] = useState<ProcessInputV1 | 'new' | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const persist = async (nextInputs: ProcessInputV1FormValues[]) => {
    setSaving(true)
    setError(null)
    try {
      const result = await saveProcessInputsV1(versionId, { inputs: nextInputs })
      onSaved(result)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save inputs.')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveInput = async (values: ProcessInputV1FormValues) => {
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
    await persist(nextValues)
    setEditingInput(null)
  }

  const handleDelete = (input: ProcessInputV1) => {
    const nextValues = toFormValues(inputs).filter((row) => row.id !== input.id)
    void persist(nextValues)
  }

  return (
    <>
      <Text strong style={{ display: 'block', marginBottom: 20, fontSize: 16 }}>
        What does &quot;{processName}&quot; receive or consume?
      </Text>
      {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}

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
                  {index + 1} {input.item_group_name}
                </Text>
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    UOM: {input.uom} {input.is_required ? '' : '(optional)'}
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
                  aria-label={`Delete ${input.item_group_name}`}
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

      <Flex justify="end">
        <Button type="primary" loading={saving} onClick={onContinue}>
          Save & Continue →
        </Button>
      </Flex>

      <InputEditorModalV1
        open={editingInput !== null}
        input={editingInput === 'new' ? null : editingInput}
        onClose={() => setEditingInput(null)}
        onSave={handleSaveInput}
      />
    </>
  )
}
