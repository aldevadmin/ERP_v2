import { useState } from 'react'
import { Alert, Button, Flex, Typography } from 'antd'
import { DeleteOutlined, EditOutlined } from '@ant-design/icons'
import { ApiError } from '../../shared/api/http'
import OutputEditorModal from './OutputEditorModal'
import { saveProcessOutputs } from './api'
import type { ProcessOutput, ProcessOutputFormValues } from './types'

const { Text } = Typography

function toFormValues(rows: ProcessOutput[]): ProcessOutputFormValues[] {
  return rows.map((row) => ({
    id: row.id,
    item_type: row.item_type,
    item: row.item_id,
    uom: row.uom,
    classification: row.classification,
    can_move_forward: row.can_move_forward,
    creates_traceable_output: row.creates_traceable_output,
    default_storage_destination: row.default_storage_destination,
  }))
}

export default function Step3OutputsForm({
  processName,
  versionId,
  outputs,
  onSaved,
  onContinue,
}: {
  processName: string
  versionId: number
  outputs: ProcessOutput[]
  onSaved: (outputs: ProcessOutput[]) => void
  onContinue: () => void
}) {
  const [editingOutput, setEditingOutput] = useState<ProcessOutput | 'new' | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const persist = async (nextOutputs: ProcessOutputFormValues[]) => {
    setSaving(true)
    setError(null)
    try {
      const result = await saveProcessOutputs(versionId, { outputs: nextOutputs })
      onSaved(result)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save outputs.')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveOutput = async (values: ProcessOutputFormValues) => {
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

  const handleDelete = (output: ProcessOutput) => {
    const nextValues = toFormValues(outputs).filter((row) => row.id !== output.id)
    void persist(nextValues)
  }

  return (
    <>
      <Text strong style={{ display: 'block', marginBottom: 20, fontSize: 16 }}>
        What can &quot;{processName}&quot; produce?
      </Text>
      {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}

      <Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>
        OUTPUTS
      </Text>
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
                  {index + 1} {output.item_label}
                </Text>
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Classification: {output.classification_name}
                  </Text>
                </div>
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Creates Traceable Output: {output.creates_traceable_output ? 'Yes' : 'No'}
                  </Text>
                </div>
              </div>
              <Flex gap={8}>
                <Button
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => setEditingOutput(output)}
                >
                  Edit
                </Button>
                <Button
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  aria-label={`Delete ${output.item_label}`}
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

      <OutputEditorModal
        open={editingOutput !== null}
        output={editingOutput === 'new' ? null : editingOutput}
        onClose={() => setEditingOutput(null)}
        onSave={handleSaveOutput}
      />
    </>
  )
}
