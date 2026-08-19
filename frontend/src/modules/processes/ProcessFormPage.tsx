import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Alert, Button, Card, Form, Input, Select, Switch, Typography } from 'antd'
import { ApiError } from '../../shared/api/http'
import { listMaterials } from '../materials/api'
import type { Material } from '../materials/types'
import { createProcess, getProcess, listProcessCategories, updateProcess } from './api'
import { RESOURCE_TYPE_OPTIONS } from './types'
import type { ProcessCategory, ProcessFormValues } from './types'

const { Title } = Typography
const { TextArea } = Input

export default function ProcessFormPage() {
  const { id } = useParams<{ id: string }>()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const [form] = Form.useForm<ProcessFormValues>()
  const [loading, setLoading] = useState(isEdit)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [categories, setCategories] = useState<ProcessCategory[]>([])
  const [materials, setMaterials] = useState<Material[]>([])

  useEffect(() => {
    listProcessCategories({ isActive: true }).then((response) => setCategories(response.results))
    listMaterials({ isActive: true }).then((response) => setMaterials(response.results))
  }, [])

  useEffect(() => {
    if (!id) return
    getProcess(Number(id))
      .then((process) => form.setFieldsValue(process))
      .catch(() => setError('Could not load this process.'))
      .finally(() => setLoading(false))
  }, [id, form])

  const handleSubmit = async (values: ProcessFormValues) => {
    setError(null)
    setSubmitting(true)
    try {
      if (id) {
        await updateProcess(Number(id), values)
      } else {
        await createProcess(values)
      }
      navigate('/processes')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save process.')
    } finally {
      setSubmitting(false)
    }
  }

  const materialOptions = materials.map((m) => ({ value: m.id, label: `${m.name} (${m.code})` }))

  return (
    <Card style={{ maxWidth: 720, margin: '0 auto' }}>
      <Title level={4}>{isEdit ? 'Edit Process' : 'Create Process'}</Title>
      {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}
      <Form<ProcessFormValues>
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        disabled={loading || submitting}
        initialValues={{ is_active: true, inputs: [], outputs: [] }}
      >
        <Form.Item
          label="Process Name"
          name="name"
          rules={[{ required: true, message: 'Enter a process name.' }]}
        >
          <Input size="large" />
        </Form.Item>
        <Form.Item
          label="Category"
          name="category"
          rules={[{ required: true, message: 'Select a category.' }]}
        >
          <Select
            size="large"
            options={categories.map((c) => ({ value: c.id, label: c.name }))}
            showSearch
            optionFilterProp="label"
          />
        </Form.Item>
        <Form.Item
          label="Resource"
          name="resource_type"
          rules={[{ required: true, message: 'Select a resource type.' }]}
        >
          <Select size="large" options={RESOURCE_TYPE_OPTIONS} />
        </Form.Item>
        <Form.Item label="Inputs" name="inputs">
          <Select
            mode="multiple"
            size="large"
            placeholder="Select input materials"
            options={materialOptions}
            showSearch
            optionFilterProp="label"
          />
        </Form.Item>
        <Form.Item label="Outputs" name="outputs">
          <Select
            mode="multiple"
            size="large"
            placeholder="Select output materials"
            options={materialOptions}
            showSearch
            optionFilterProp="label"
          />
        </Form.Item>
        <Form.Item label="Description" name="description">
          <TextArea rows={3} />
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
    </Card>
  )
}
