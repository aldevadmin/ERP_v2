import { useState } from 'react'
import { Alert, Button, Flex, Tag, Typography } from 'antd'
import { DeleteOutlined, EditOutlined } from '@ant-design/icons'
import { ApiError } from '../../shared/api/http'
import OutputEditorModalV1 from './OutputEditorModalV1'
import { saveProcessOutputsV1 } from './api'
import type { ProcessOutputV1, ProcessOutputV1FormValues } from './types'

const { Text } = Typography

function toFormValues(rows: ProcessOutputV1[]): ProcessOutputV1FormValues[] {
  return rows.map((row) => ({
    id: row.id,
    item_group: row.item_group,
    classification: row.classification,
    uom: row.uom,
    can_move_forward: row.can_move_forward,
    creates_traceable_output: row.creates_traceable_output,
  }))
}

export default function Step3OutputsFormV1({
  processName,
  versionId,
  outputs,
  onSaved,
  onContinue,
}: {
  processName: string
  versionId: number
  outputs: ProcessOutputV1[]
  onSaved: (outputs: ProcessOutputV1[]) => void
  onContinue: () => void
}) {
  const [editingOutput, setEditingOutput] = useState<ProcessOutputV1 | 'new' | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const persist = async (nextOutputs: ProcessOutputV1FormValues[]) => {
    setSaving(true)
    setError(null)
    try {
      const result = await saveProcessOutputsV1(versionId, { outputs: nextOutputs })
      onSaved(result)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save outputs.')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveOutput = async (values: ProcessOutputV1FormValues) => {
    const nextValues = toFormValues(outputs)
    const existingIndex =
      editingOutput && editingOutput !== 'new'
        ? outputs.findIndex((row) => row.id === editingOutput.id)
        : -1
    if (existingIndex >= 0) {
      nextValues[existingIndex] = values
    } else {
      nextValues.push(values)
    }
    await persist(nextValues)
    setEditingOutput(null)
  }

  const handleDelete = (output: ProcessOutputV1) => {
    const nextValues = toFormValues(outputs).filter((row) => row.id !== output.id)
    void persist(nextValues)
  }

  return (
    <>
      <Text strong style={{ display: 'block', marginBottom: 20, fontSize: 16 }}>
        What can &quot;{processName}&quot; produce?
      </Text>
      {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}

      <Flex vertical gap={8} style={{ marginBottom: 16 }}>
        {outputs.length === 0 && <Text type="secondary">No outputs added yet.</Text>}
        {outputs.map((output, index) => (
          <div
            key={output.id}
            style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: '12px 16px' }}
          >
            <Flex justify="space-between" align="start">
              <div>
                <Text strong>
                  {index + 1} {output.item_group_name}
                </Text>{' '}
                {output.classification_name && <Tag>{output.classification_name}</Tag>}
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    UOM: {output.uom}
                  </Text>
                </div>
              </div>
              <Flex gap={8}>
                <Button size="small" icon={<EditOutlined />} onClick={() => setEditingOutput(output)}>
                  Edit
                </Button>
                <Button
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  aria-label={`Delete ${output.item_group_name}`}
                  onClick={() => handleDelete(output)}
                />
              </Flex>
            </Flex>
          </div>
        ))}
      </Flex>
      <Button onClick={() => setEditingOutput('new')} style={{ marginBottom: 24 }}>
        + Add Output
      </Button>

      <Flex justify="end">
        <Button type="primary" loading={saving} onClick={onContinue}>
          Save & Continue →
        </Button>
      </Flex>

      <OutputEditorModalV1
        open={editingOutput !== null}
        output={editingOutput === 'new' ? null : editingOutput}
        onClose={() => setEditingOutput(null)}
        onSave={handleSaveOutput}
      />
    </>
  )
}
