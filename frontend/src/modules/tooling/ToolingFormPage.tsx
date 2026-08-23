import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { InfoCircleOutlined } from '@ant-design/icons'
import {
  Alert,
  Breadcrumb,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Select,
  Switch,
  Typography,
} from 'antd'
import { ApiError } from '../../shared/api/http'
import { listItems } from '../items/api'
import type { Item } from '../items/types'
import {
  getTooling,
  createTooling,
  listToolingTypes,
  saveToolingCompatibilities,
  updateTooling,
} from './api'
import type { Tooling, ToolingFormValues, ToolingType } from './types'

const { Title, Text } = Typography

export default function ToolingFormPage() {
  const { id } = useParams<{ id: string }>()
  const isEdit = Boolean(id)
  const [form] = Form.useForm<ToolingFormValues>()
  const [tooling, setTooling] = useState<Tooling | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [types, setTypes] = useState<ToolingType[]>([])
  const [loading, setLoading] = useState(isEdit)
  const [submitting, setSubmitting] = useState(false)
  const [savingCompatibilities, setSavingCompatibilities] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listItems({ isActive: true }).then((response) =>
      setItems(response.results.filter((i) => i.item_class === 'WIP' || i.item_class === 'FINISHED_GOOD')),
    )
  }, [])

  useEffect(() => {
    listToolingTypes({ isActive: true }).then((response) => setTypes(response.results))
  }, [])

  useEffect(() => {
    if (!id) return
    getTooling(Number(id))
      .then((loaded) => {
        setTooling(loaded)
        form.setFieldsValue(loaded)
      })
      .catch(() => setError('Could not load this tooling.'))
      .finally(() => setLoading(false))
  }, [id, form])

  const handleSubmit = async (values: ToolingFormValues) => {
    setError(null)
    setSubmitting(true)
    try {
      const saved = id ? await updateTooling(Number(id), values) : await createTooling(values)
      setTooling(saved)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this tooling.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleCompatibleItemsChange = async (itemIds: number[]) => {
    if (!tooling) return
    setSavingCompatibilities(true)
    setError(null)
    try {
      const saved = await saveToolingCompatibilities(tooling.id, {
        compatibilities: itemIds.map((itemId) => {
          const existing = tooling.compatibilities.find((c) => c.item === itemId)
          return { id: existing?.id, item: itemId, process_definition: null }
        }),
      })
      setTooling(saved)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save compatible items.')
    } finally {
      setSavingCompatibilities(false)
    }
  }

  const pageTitle = isEdit ? 'Edit Tooling' : 'Create Tooling'

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 12 }}
        items={[
          { title: <Link to="/settings">Settings</Link> },
          { title: <Link to="/tooling">Tooling</Link> },
          { title: pageTitle },
        ]}
      />
      <Card style={{ maxWidth: 720, margin: '0 auto' }}>
        <Title level={4}>{pageTitle}</Title>
      {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}
      <Form<ToolingFormValues>
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        disabled={loading || submitting}
        initialValues={{ is_active: true, cavity_count: null, default_standard_rate: null }}
      >
        <Form.Item
          label="Tooling Name"
          name="name"
          rules={[{ required: true, message: 'Enter a tooling name.' }]}
        >
          <Input size="large" placeholder="e.g. 10&quot; Round Mould" />
        </Form.Item>
        <Form.Item
          label="Tooling Code"
          name="code"
          rules={[{ required: true, message: 'Enter a tooling code.' }]}
        >
          <Input size="large" disabled={isEdit} placeholder="e.g. MLD-101" />
        </Form.Item>
        <Form.Item
          label="Type"
          name="tooling_type"
          rules={[{ required: true, message: 'Select a type.' }]}
        >
          <Select
            size="large"
            style={{ maxWidth: 280 }}
            options={types.map((t) => ({ value: t.id, label: t.name }))}
          />
        </Form.Item>
        <Form.Item
          label="Cavity Count (optional)"
          name="cavity_count"
          tooltip={{
            title: 'How many identical parts this tool produces in a single cycle — e.g. a 4-cavity mould makes 4 pieces per press.',
            icon: <InfoCircleOutlined />,
          }}
        >
          <InputNumber style={{ width: '100%' }} min={1} />
        </Form.Item>
        <Form.Item label="Standard Output / Hour (optional)" name="default_standard_rate">
          <InputNumber style={{ width: '100%' }} min={0} />
        </Form.Item>
        <Form.Item label="Active" name="is_active" valuePropName="checked">
          <Switch />
        </Form.Item>
        <Form.Item label="Notes (optional)" name="notes">
          <Input.TextArea rows={3} />
        </Form.Item>
        <Form.Item style={{ marginTop: 24 }}>
          <Button type="primary" htmlType="submit" size="large" loading={submitting}>
            Save Tooling
          </Button>
        </Form.Item>
      </Form>

      {tooling && (
        <div style={{ marginTop: 8, paddingTop: 24, borderTop: '1px solid #f0f0f0' }}>
          <Text strong style={{ display: 'block', marginBottom: 4 }}>
            Compatible Items / SKUs
          </Text>
          <Text type="secondary" style={{ display: 'block', marginBottom: 16, fontSize: 13 }}>
            Filters this tooling in the picker when assigning it to a position — the backend still
            validates the selection either way.
          </Text>
          <Select
            mode="multiple"
            style={{ width: '100%' }}
            placeholder="Search and select compatible items"
            loading={savingCompatibilities}
            value={tooling.compatibilities.map((c) => c.item)}
            onChange={(values: number[]) => void handleCompatibleItemsChange(values)}
            options={items.map((i) => ({ value: i.id, label: `${i.name} (${i.code})` }))}
            optionFilterProp="label"
          />
        </div>
      )}
      </Card>
    </div>
  )
}
