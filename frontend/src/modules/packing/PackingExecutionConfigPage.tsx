import { useEffect, useState } from 'react'
import { Alert, Breadcrumb, Button, Card, Form, InputNumber, Select, Switch, Typography, message } from 'antd'
import { Link } from 'react-router'
import { ApiError } from '../../shared/api/http'
import { getExecutionConfig, updateExecutionConfig } from './api'
import type { PackingExecutionConfig } from './types'

const { Title, Text } = Typography

export default function PackingExecutionConfigPage() {
  const [form] = Form.useForm<PackingExecutionConfig>()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getExecutionConfig()
      .then((config) => form.setFieldsValue(config))
      .catch(() => setError('Could not load the packing execution configuration.'))
      .finally(() => setLoading(false))
  }, [form])

  const handleSubmit = async (values: PackingExecutionConfig) => {
    setError(null)
    setSaving(true)
    try {
      const saved = await updateExecutionConfig(values)
      form.setFieldsValue(saved)
      message.success('Saved.')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 12 }}
        items={[{ title: <Link to="/settings">Settings</Link> }, { title: 'Packing Execution' }]}
      />
      <Card style={{ maxWidth: 640, margin: '0 auto' }} loading={loading}>
        <Title level={4}>Packing Execution Configuration</Title>
        <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
          Governs how the shift floor's live Work Centre board and interval recording behave.
        </Text>
        {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}
        <Form<PackingExecutionConfig>
          form={form}
          layout="vertical"
          onFinish={(values) => void handleSubmit(values)}
          disabled={loading || saving}
        >
          <Form.Item label="Recording Mode" name="recording_mode">
            <Select
              options={[
                { value: 'INTERVAL_BASED', label: 'Interval Based' },
                { value: 'SHIFT_TOTAL', label: 'Shift Total' },
                { value: 'MANUAL_EVENT', label: 'Manual Event Based' },
                { value: 'MACHINE_GENERATED', label: 'Machine Generated (Future)', disabled: true },
              ]}
            />
          </Form.Item>
          <Form.Item
            label="Default Interval (minutes)"
            name="default_interval_minutes"
            tooltip="How long one 'Record Hour' window covers by default."
          >
            <InputNumber min={5} max={480} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            label="Auto-create expected interval records"
            name="auto_create_expected_intervals"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
          <Form.Item label="Allow late entry" name="allow_late_entry" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item
            label="Missing record warning after (minutes)"
            name="missing_record_warning_minutes"
            tooltip="How overdue a record can be before a Work Centre tile shows a Missing Interval Record warning."
          >
            <InputNumber min={1} max={240} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="Plan Calculation" name="plan_calculation">
            <Select
              options={[
                { value: 'STANDARD_RATE', label: 'Standard Rate × Available Minutes' },
                { value: 'MANUAL', label: 'Manual' },
              ]}
            />
          </Form.Item>
          <Form.Item
            label="Allow partial interval on SKU change"
            name="allow_partial_interval_on_sku_change"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
          <Form.Item style={{ marginTop: 8 }}>
            <Button type="primary" htmlType="submit" loading={saving}>
              Save
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}
