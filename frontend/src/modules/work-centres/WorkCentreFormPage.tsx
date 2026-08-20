import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { Alert, Button, Card, Flex, Form, Input, Select, Switch, Typography } from 'antd'
import { DeleteOutlined, EditOutlined } from '@ant-design/icons'
import { ApiError } from '../../shared/api/http'
import CapabilityEditorModal from './CapabilityEditorModal'
import {
  createWorkCentre,
  getWorkCentre,
  saveWorkCentreCapabilities,
  updateWorkCentre,
} from './api'
import { WORK_CENTRE_TYPE_OPTIONS } from './types'
import type { WorkCentre, WorkCentreCapability, WorkCentreCapabilityFormValues, WorkCentreFormValues } from './types'

const { Title, Text } = Typography

function toFormValues(rows: WorkCentreCapability[]): WorkCentreCapabilityFormValues[] {
  return rows.map((row) => ({
    id: row.id,
    process_definition: row.process_definition,
    standard_rate: row.standard_rate,
  }))
}

export default function WorkCentreFormPage() {
  const { id } = useParams<{ id: string }>()
  const [form] = Form.useForm<WorkCentreFormValues>()
  const [workCentre, setWorkCentre] = useState<WorkCentre | null>(null)
  const isEdit = workCentre !== null
  const [loading, setLoading] = useState(Boolean(id))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingCapability, setEditingCapability] = useState<WorkCentreCapability | 'new' | null>(
    null,
  )
  const [savingCapabilities, setSavingCapabilities] = useState(false)

  useEffect(() => {
    if (!id) return
    getWorkCentre(Number(id))
      .then((loaded) => {
        setWorkCentre(loaded)
        form.setFieldsValue(loaded)
      })
      .catch(() => setError('Could not load this work centre.'))
      .finally(() => setLoading(false))
  }, [id, form])

  const handleSubmit = async (values: WorkCentreFormValues) => {
    setError(null)
    setSubmitting(true)
    try {
      const saved = id
        ? await updateWorkCentre(Number(id), values)
        : await createWorkCentre(values)
      setWorkCentre(saved)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this work centre.')
    } finally {
      setSubmitting(false)
    }
  }

  const persistCapabilities = async (rows: WorkCentreCapabilityFormValues[]) => {
    if (!workCentre) return
    setSavingCapabilities(true)
    setError(null)
    try {
      const saved = await saveWorkCentreCapabilities(workCentre.id, { capabilities: rows })
      setWorkCentre(saved)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save capabilities.')
    } finally {
      setSavingCapabilities(false)
    }
  }

  const handleSaveCapability = async (values: WorkCentreCapabilityFormValues) => {
    if (!workCentre) return
    const nextValues = toFormValues(workCentre.capabilities)
    const existingIndex =
      editingCapability && editingCapability !== 'new'
        ? workCentre.capabilities.findIndex((row) => row.id === editingCapability.id)
        : -1
    if (existingIndex >= 0) {
      nextValues[existingIndex] = values
    } else {
      nextValues.push(values)
    }
    await persistCapabilities(nextValues)
    setEditingCapability(null)
  }

  const handleDeleteCapability = (capability: WorkCentreCapability) => {
    if (!workCentre) return
    const nextValues = toFormValues(workCentre.capabilities).filter(
      (row) => row.id !== capability.id,
    )
    void persistCapabilities(nextValues)
  }

  return (
    <Card style={{ maxWidth: 720, margin: '0 auto' }}>
      <Title level={4}>{isEdit ? 'Edit Work Centre' : 'New Work Centre'}</Title>
      {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}
      <Form<WorkCentreFormValues>
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        disabled={loading || submitting}
        initialValues={{ is_active: true, type: 'MACHINE' }}
      >
        <Form.Item
          label="Code"
          name="code"
          rules={[{ required: true, message: 'Enter a work centre code.' }]}
        >
          <Input size="large" disabled={isEdit} />
        </Form.Item>
        <Form.Item
          label="Name"
          name="name"
          rules={[{ required: true, message: 'Enter a work centre name.' }]}
        >
          <Input size="large" />
        </Form.Item>
        <Form.Item
          label="Type"
          name="type"
          rules={[{ required: true, message: 'Select a type.' }]}
        >
          <Select size="large" style={{ maxWidth: 240 }} options={WORK_CENTRE_TYPE_OPTIONS} />
        </Form.Item>
        <Form.Item label="Active" name="is_active" valuePropName="checked">
          <Switch />
        </Form.Item>
        <Form.Item style={{ marginTop: 24 }}>
          <Button type="primary" htmlType="submit" size="large" loading={submitting}>
            Save
          </Button>
        </Form.Item>
      </Form>

      {workCentre && (
        <div style={{ marginTop: 8, paddingTop: 24, borderTop: '1px solid #f0f0f0' }}>
          <Text strong style={{ display: 'block', marginBottom: 4 }}>
            Capable Processes
          </Text>
          <Text type="secondary" style={{ display: 'block', marginBottom: 16, fontSize: 13 }}>
            Which processes this work centre can run, and optionally its standard output/hour for
            each.
          </Text>
          <Flex vertical gap={8} style={{ marginBottom: 16 }}>
            {workCentre.capabilities.length === 0 && (
              <Text type="secondary">No processes mapped yet.</Text>
            )}
            {workCentre.capabilities.map((capability) => (
              <div
                key={capability.id}
                style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: '12px 16px' }}
              >
                <Flex justify="space-between" align="center">
                  <div>
                    <Text strong>
                      {capability.process_name} ({capability.process_code})
                    </Text>
                    <div>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        Standard Rate:{' '}
                        {capability.standard_rate !== null ? capability.standard_rate : 'Not set'}
                      </Text>
                    </div>
                  </div>
                  <Flex gap={8}>
                    <Button
                      size="small"
                      icon={<EditOutlined />}
                      onClick={() => setEditingCapability(capability)}
                    >
                      Edit
                    </Button>
                    <Button
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      aria-label={`Remove ${capability.process_name}`}
                      onClick={() => handleDeleteCapability(capability)}
                    />
                  </Flex>
                </Flex>
              </div>
            ))}
          </Flex>
          <Button loading={savingCapabilities} onClick={() => setEditingCapability('new')}>
            + Add Capability
          </Button>
        </div>
      )}

      <CapabilityEditorModal
        open={editingCapability !== null}
        capability={editingCapability === 'new' ? null : editingCapability}
        onClose={() => setEditingCapability(null)}
        onSave={handleSaveCapability}
      />
    </Card>
  )
}
