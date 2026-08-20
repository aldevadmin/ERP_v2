import { useState } from 'react'
import { Alert, Button, Checkbox, Flex, Table, Typography } from 'antd'
import { DeleteOutlined, EditOutlined } from '@ant-design/icons'
import { ApiError } from '../../shared/api/http'
import ParameterEditorModal from './ParameterEditorModal'
import { saveProcessParameters, saveProcessPerformance } from './api'
import { PARAMETER_CAPTURE_AT_OPTIONS, PARAMETER_DATA_TYPE_OPTIONS } from './types'
import type { ProcessParameter, ProcessParameterFormValues } from './types'

const { Text } = Typography

function labelFor(options: { value: string; label: string }[], value: string): string {
  return options.find((option) => option.value === value)?.label ?? value
}

function toFormValues(rows: ProcessParameter[]): ProcessParameterFormValues[] {
  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    code: row.code,
    data_type: row.data_type,
    unit: row.unit,
    capture_at: row.capture_at,
    is_required: row.is_required,
    default_value: row.default_value,
  }))
}

export default function Step6ParametersForm({
  versionId,
  parameters,
  allowManualStandardRate,
  reserveMachineDerivedRate,
  onParametersSaved,
  onPerformanceSaved,
  onContinue,
}: {
  versionId: number
  parameters: ProcessParameter[]
  allowManualStandardRate: boolean
  reserveMachineDerivedRate: boolean
  onParametersSaved: (parameters: ProcessParameter[]) => void
  onPerformanceSaved: (values: {
    allow_manual_standard_rate: boolean
    reserve_machine_derived_rate: boolean
  }) => void
  onContinue: () => void
}) {
  const [editingParameter, setEditingParameter] = useState<ProcessParameter | 'new' | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const persist = async (nextParameters: ProcessParameterFormValues[]) => {
    setSaving(true)
    setError(null)
    try {
      const result = await saveProcessParameters(versionId, { parameters: nextParameters })
      onParametersSaved(result)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save parameters.')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveParameter = async (values: ProcessParameterFormValues) => {
    const nextValues = toFormValues(parameters)
    const existingIndex =
      editingParameter && editingParameter !== 'new'
        ? parameters.findIndex((row) => row.id === editingParameter.id)
        : -1
    if (existingIndex >= 0) {
      nextValues[existingIndex] = values
    } else {
      nextValues.push(values)
    }
    await persist(nextValues)
    setEditingParameter(null)
  }

  const handleDelete = (parameter: ProcessParameter) => {
    const nextValues = toFormValues(parameters).filter((row) => row.id !== parameter.id)
    void persist(nextValues)
  }

  const handlePerformanceChange = async (
    field: 'allow_manual_standard_rate' | 'reserve_machine_derived_rate',
    value: boolean,
  ) => {
    setError(null)
    try {
      const result = await saveProcessPerformance(versionId, { [field]: value })
      onPerformanceSaved(result)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this step.')
    }
  }

  return (
    <>
      <Text strong style={{ display: 'block', marginBottom: 20, fontSize: 16 }}>
        What else should be configured or recorded?
      </Text>
      {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}

      <Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>
        PARAMETERS
      </Text>
      <Table<ProcessParameter>
        rowKey="id"
        size="small"
        pagination={false}
        style={{ marginBottom: 16 }}
        dataSource={parameters}
        locale={{ emptyText: 'No parameters added yet.' }}
        columns={[
          { title: 'Name', dataIndex: 'label' },
          {
            title: 'Type',
            dataIndex: 'data_type',
            render: (value: string) => labelFor(PARAMETER_DATA_TYPE_OPTIONS, value),
          },
          {
            title: 'Required',
            dataIndex: 'is_required',
            render: (value: boolean) => (value ? 'Yes' : 'No'),
          },
          {
            title: 'Capture At',
            dataIndex: 'capture_at',
            render: (value: string) => labelFor(PARAMETER_CAPTURE_AT_OPTIONS, value),
          },
          {
            title: '',
            key: 'actions',
            render: (_, record) => (
              <Flex gap={8}>
                <Button
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => setEditingParameter(record)}
                >
                  Edit
                </Button>
                <Button
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  aria-label={`Delete ${record.label}`}
                  onClick={() => handleDelete(record)}
                />
              </Flex>
            ),
          },
        ]}
      />
      <Button onClick={() => setEditingParameter('new')} style={{ marginBottom: 24 }}>
        + Add Parameter
      </Button>

      <div style={{ marginBottom: 24 }}>
        <Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>
          PERFORMANCE
        </Text>
        <Flex vertical gap={8}>
          <Checkbox
            checked={allowManualStandardRate}
            onChange={(e) =>
              void handlePerformanceChange('allow_manual_standard_rate', e.target.checked)
            }
          >
            Allow manually configured Standard Output / Hour
          </Checkbox>
          <Checkbox
            checked={reserveMachineDerivedRate}
            onChange={(e) =>
              void handlePerformanceChange('reserve_machine_derived_rate', e.target.checked)
            }
          >
            Reserve machine-derived rate for future integration
          </Checkbox>
        </Flex>
      </div>

      <Flex justify="end">
        <Button type="primary" loading={saving} onClick={onContinue}>
          Save & Continue →
        </Button>
      </Flex>

      <ParameterEditorModal
        open={editingParameter !== null}
        parameter={editingParameter === 'new' ? null : editingParameter}
        onClose={() => setEditingParameter(null)}
        onSave={handleSaveParameter}
      />
    </>
  )
}
