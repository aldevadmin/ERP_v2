import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import {
  Alert,
  Breadcrumb,
  Button,
  Card,
  Descriptions,
  Empty,
  Flex,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Radio,
  Select,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import { DeleteOutlined } from '@ant-design/icons'
import { ApiError } from '../../shared/api/http'
import { listItems, listUOMs } from '../items/api'
import type { Item, UOM } from '../items/types'
import {
  createPackagingProfile,
  getPackagingProfile,
  getPackagingProfileVersion,
  newPackagingProfileDraft,
  publishPackagingProfileVersion,
  savePackagingMaterials,
  updatePackagingProfile,
  updatePackagingProfileVersion,
} from './api'
import { PACKAGING_MATERIAL_LEVEL_OPTIONS, PACKAGING_PROFILE_SCOPE_OPTIONS, PACK_MODE_OPTIONS } from './types'
import type {
  PackagingMaterialRow,
  PackagingProfile,
  PackagingProfileFormValues,
  PackagingProfileVersion,
} from './types'

const { Title, Text } = Typography

const STEPS = [
  { key: 'basics', label: 'Basics' },
  { key: 'materials', label: 'Materials' },
  { key: 'specifications', label: 'Specifications' },
  { key: 'review', label: 'Review' },
] as const
type StepKey = (typeof STEPS)[number]['key']

export default function PackagingProfileFormPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isEdit = Boolean(id)
  const [basicsForm] = Form.useForm<PackagingProfileFormValues>()
  const [specForm] = Form.useForm()

  const [profile, setProfile] = useState<PackagingProfile | null>(null)
  const [version, setVersion] = useState<PackagingProfileVersion | null>(null)
  const [currentStep, setCurrentStep] = useState<StepKey>('basics')
  const [loading, setLoading] = useState(isEdit)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [finishedItems, setFinishedItems] = useState<Item[]>([])
  const [packagingItems, setPackagingItems] = useState<Item[]>([])
  const [uoms, setUoms] = useState<UOM[]>([])
  const [materialRows, setMaterialRows] = useState<PackagingMaterialRow[]>([])

  const editable = !version || version.status === 'DRAFT'

  useEffect(() => {
    listItems({ isActive: true }).then((response) =>
      setFinishedItems(response.results.filter((i) => i.item_class === 'WIP' || i.item_class === 'FINISHED_GOOD')),
    )
    listItems({ isActive: true, itemClass: 'PACKAGING_MATERIAL' }).then((response) =>
      setPackagingItems(response.results),
    )
    listUOMs({ isActive: true }).then((response) => setUoms(response.results))
  }, [])

  const loadVersion = useCallback(
    (versionId: number) => {
      getPackagingProfileVersion(versionId).then((v) => {
        setVersion(v)
        specForm.setFieldsValue(v)
        setMaterialRows(
          v.materials.map((m) => ({
            id: m.id,
            item: m.item,
            level: m.level,
            quantity: Number(m.quantity),
            uom: m.uom,
          })),
        )
      })
    },
    [specForm],
  )

  useEffect(() => {
    if (!id) return
    getPackagingProfile(Number(id))
      .then((data) => {
        setProfile(data)
        basicsForm.setFieldsValue(data)
        if (data.current_version) {
          loadVersion(data.current_version.id)
        }
      })
      .catch(() => setError('Could not load this profile.'))
      .finally(() => setLoading(false))
  }, [id, basicsForm, loadVersion])

  const saveBasics = async () => {
    let values: PackagingProfileFormValues
    try {
      values = await basicsForm.validateFields()
    } catch {
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      if (profile) {
        const updated = await updatePackagingProfile(profile.id, values)
        setProfile(updated)
      } else {
        const created = await createPackagingProfile(values)
        setProfile(created)
        if (created.current_version) loadVersion(created.current_version.id)
        navigate(`/packaging-profiles/${created.id}/edit`, { replace: true })
      }
      setCurrentStep('materials')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this profile.')
    } finally {
      setSubmitting(false)
    }
  }

  const saveMaterials = async () => {
    if (!version) return
    setError(null)
    setSubmitting(true)
    try {
      const saved = await savePackagingMaterials(version.id, materialRows)
      setVersion(saved)
      setCurrentStep('specifications')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save materials.')
    } finally {
      setSubmitting(false)
    }
  }

  const saveSpecifications = async () => {
    if (!version) return
    let values: Record<string, unknown>
    try {
      values = await specForm.validateFields()
    } catch {
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      const saved = await updatePackagingProfileVersion(version.id, values)
      setVersion(saved)
      setCurrentStep('review')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save specifications.')
    } finally {
      setSubmitting(false)
    }
  }

  const handlePublish = async () => {
    if (!version) return
    setError(null)
    setSubmitting(true)
    try {
      const published = await publishPackagingProfileVersion(version.id)
      setVersion(published)
      message.success('Packaging profile published.')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not publish this profile.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleNewDraft = async () => {
    if (!version) return
    setSubmitting(true)
    try {
      const draft = await newPackagingProfileDraft(version.id)
      loadVersion(draft.id)
      message.success('New draft version created.')
      setCurrentStep('materials')
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : 'Could not create a new draft.')
    } finally {
      setSubmitting(false)
    }
  }

  const addMaterialRow = () => {
    setMaterialRows((prev) => [...prev, { item: 0, level: 'CARTON', quantity: 1, uom: 0 }])
  }

  const updateMaterialRow = (index: number, patch: Partial<PackagingMaterialRow>) => {
    setMaterialRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  const removeMaterialRow = (index: number) => {
    setMaterialRows((prev) => prev.filter((_, i) => i !== index))
  }

  const pageTitle = isEdit ? 'Edit Packaging Profile' : 'Create Packaging Profile'
  const uomOptions = uoms.map((u) => ({ value: u.id, label: `${u.name} (${u.code})` }))

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 12 }}
        items={[
          { title: <Link to="/settings">Settings</Link> },
          { title: <Link to="/packaging-profiles">Packaging Profiles</Link> },
          { title: pageTitle },
        ]}
      />
      <Card style={{ maxWidth: 960, margin: '0 auto' }} styles={{ body: { padding: 0 } }} loading={loading}>
        <Flex justify="space-between" align="center" style={{ padding: '20px 24px', borderBottom: '1px solid #f0f0f0' }}>
          <Title level={4} style={{ margin: 0 }}>
            {pageTitle}
          </Title>
          {version && (
            <Tag color={version.status === 'PUBLISHED' ? 'green' : version.status === 'DRAFT' ? 'default' : 'orange'}>
              v{version.version_number} — {version.status}
            </Tag>
          )}
        </Flex>
        <Flex align="stretch">
          <div style={{ width: 200, borderRight: '1px solid #f0f0f0', padding: '20px 0', flexShrink: 0 }}>
            {STEPS.map((step) => (
              <div
                key={step.key}
                role="button"
                onClick={() => {
                  setError(null)
                  setCurrentStep(step.key)
                }}
                style={{
                  padding: '10px 24px',
                  cursor: 'pointer',
                  color: step.key === currentStep ? '#155eef' : 'inherit',
                  fontWeight: step.key === currentStep ? 600 : 400,
                }}
              >
                {step.label}
              </div>
            ))}
          </div>
          <div style={{ flex: 1, padding: '24px 32px', minWidth: 0 }}>
            {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}

            {currentStep === 'basics' && (
              <Form<PackagingProfileFormValues>
                form={basicsForm}
                layout="vertical"
                disabled={loading || !editable}
                initialValues={{ scope: 'STANDARD', is_active: true }}
              >
                <Form.Item label="Profile Code" name="code" rules={[{ required: true, message: 'Enter a code.' }]}>
                  <Input size="large" disabled={isEdit} />
                </Form.Item>
                <Form.Item label="Profile Name" name="name" rules={[{ required: true, message: 'Enter a name.' }]}>
                  <Input size="large" />
                </Form.Item>
                <Form.Item
                  label="Finished Item"
                  name="finished_item"
                  rules={[{ required: true, message: 'Select the finished item.' }]}
                >
                  <Select
                    size="large"
                    showSearch
                    optionFilterProp="label"
                    options={finishedItems.map((i) => ({ value: i.id, label: `${i.name} (${i.code})` }))}
                  />
                </Form.Item>
                <Form.Item label="Scope" name="scope">
                  <Radio.Group options={PACKAGING_PROFILE_SCOPE_OPTIONS} optionType="button" />
                </Form.Item>
                <Form.Item label="Active" name="is_active" valuePropName="checked">
                  <Switch />
                </Form.Item>
                <Flex justify="end">
                  <Button type="primary" loading={submitting} disabled={!editable} onClick={() => void saveBasics()}>
                    Save &amp; Continue →
                  </Button>
                </Flex>
              </Form>
            )}

            {currentStep === 'materials' &&
              (profile ? (
                <>
                  <Text strong style={{ display: 'block', marginBottom: 16 }}>
                    What packaging materials does this profile use?
                  </Text>
                  <Table<PackagingMaterialRow>
                    rowKey={(_, i) => String(i)}
                    dataSource={materialRows}
                    pagination={false}
                    locale={{ emptyText: 'No materials yet.' }}
                    columns={[
                      {
                        title: 'Item',
                        dataIndex: 'item',
                        render: (value, _row, index) => (
                          <Select
                            style={{ minWidth: 200 }}
                            disabled={!editable}
                            value={value || undefined}
                            placeholder="Select item"
                            showSearch
                            optionFilterProp="label"
                            options={packagingItems.map((i) => ({ value: i.id, label: `${i.name} (${i.code})` }))}
                            onChange={(v) => {
                              const selected = packagingItems.find((i) => i.id === v)
                              updateMaterialRow(index, { item: v, uom: selected?.inventory_uom ?? 0 })
                            }}
                          />
                        ),
                      },
                      {
                        title: 'Level',
                        dataIndex: 'level',
                        render: (value, _row, index) => (
                          <Select
                            style={{ width: 130 }}
                            disabled={!editable}
                            value={value}
                            options={PACKAGING_MATERIAL_LEVEL_OPTIONS}
                            onChange={(v) => updateMaterialRow(index, { level: v })}
                          />
                        ),
                      },
                      {
                        title: 'Quantity',
                        dataIndex: 'quantity',
                        render: (value, _row, index) => (
                          <InputNumber
                            min={0}
                            disabled={!editable}
                            value={value}
                            onChange={(v) => updateMaterialRow(index, { quantity: v ?? 0 })}
                          />
                        ),
                      },
                      {
                        title: 'UOM',
                        dataIndex: 'uom',
                        render: (value, _row, index) => (
                          <Select
                            style={{ width: 140 }}
                            disabled={!editable}
                            value={value || undefined}
                            placeholder="UOM"
                            options={uomOptions}
                            onChange={(v) => updateMaterialRow(index, { uom: v })}
                          />
                        ),
                      },
                      {
                        title: '',
                        key: 'actions',
                        width: 48,
                        render: (_, _row, index) =>
                          editable && (
                            <Button
                              size="small"
                              danger
                              icon={<DeleteOutlined />}
                              onClick={() => removeMaterialRow(index)}
                            />
                          ),
                      },
                    ]}
                  />
                  {editable && (
                    <Button style={{ marginTop: 12 }} onClick={addMaterialRow}>
                      + Add Material
                    </Button>
                  )}
                  <Flex justify="end" style={{ marginTop: 24 }}>
                    <Button
                      type="primary"
                      loading={submitting}
                      disabled={!editable}
                      onClick={() => void saveMaterials()}
                    >
                      Save &amp; Continue →
                    </Button>
                  </Flex>
                </>
              ) : (
                <Empty description="Save Basics first." style={{ paddingTop: 48 }} />
              ))}

            {currentStep === 'specifications' &&
              (version ? (
                <Form form={specForm} layout="vertical" disabled={!editable}>
                  <Form.Item label="Pack Mode" name="pack_mode">
                    <Radio.Group options={PACK_MODE_OPTIONS} optionType="button" />
                  </Form.Item>
                  <Form.Item
                    label="Selling Unit"
                    name="selling_uom"
                    rules={[{ required: true, message: 'Select a selling unit.' }]}
                  >
                    <Select
                      style={{ maxWidth: 240 }}
                      showSearch
                      optionFilterProp="label"
                      options={uomOptions}
                    />
                  </Form.Item>
                  <Flex gap={16} wrap="wrap">
                    <Form.Item label="Pieces per Pouch" name="pieces_per_pouch">
                      <InputNumber min={0} style={{ width: 160 }} />
                    </Form.Item>
                    <Form.Item label="Pouches per Carton" name="pouches_per_carton">
                      <InputNumber min={0} style={{ width: 160 }} />
                    </Form.Item>
                  </Flex>
                  <Flex gap={16} wrap="wrap">
                    <Form.Item label="Carton Length (mm)" name="carton_length_mm">
                      <InputNumber min={0} style={{ width: 150 }} />
                    </Form.Item>
                    <Form.Item label="Carton Breadth (mm)" name="carton_breadth_mm">
                      <InputNumber min={0} style={{ width: 150 }} />
                    </Form.Item>
                    <Form.Item label="Carton Height (mm)" name="carton_height_mm">
                      <InputNumber min={0} style={{ width: 150 }} />
                    </Form.Item>
                  </Flex>
                  <Flex gap={16} wrap="wrap">
                    <Form.Item label="Net Weight (kg)" name="carton_net_weight_kg">
                      <InputNumber min={0} style={{ width: 150 }} />
                    </Form.Item>
                    <Form.Item label="Gross Weight (kg)" name="carton_gross_weight_kg">
                      <InputNumber min={0} style={{ width: 150 }} />
                    </Form.Item>
                  </Flex>
                  <Flex justify="end">
                    <Button
                      type="primary"
                      loading={submitting}
                      disabled={!editable}
                      onClick={() => void saveSpecifications()}
                    >
                      Save &amp; Continue →
                    </Button>
                  </Flex>
                </Form>
              ) : (
                <Empty description="Save Basics first." style={{ paddingTop: 48 }} />
              ))}

            {currentStep === 'review' &&
              (version ? (
                <>
                  <Descriptions column={1} bordered size="small" style={{ marginBottom: 24 }}>
                    <Descriptions.Item label="Status">{version.status}</Descriptions.Item>
                    <Descriptions.Item label="Pack Mode">{version.pack_mode}</Descriptions.Item>
                    <Descriptions.Item label="Pieces per Selling Unit">
                      {version.pieces_per_selling_unit ?? '— (computed on publish)'}
                    </Descriptions.Item>
                    <Descriptions.Item label="CBM">{version.cbm ?? '— (computed on publish)'}</Descriptions.Item>
                    <Descriptions.Item label="Materials">{version.materials.length}</Descriptions.Item>
                  </Descriptions>
                  {version.status === 'DRAFT' && (
                    <Popconfirm title="Publish this version?" onConfirm={() => void handlePublish()}>
                      <Button type="primary" loading={submitting}>
                        Publish
                      </Button>
                    </Popconfirm>
                  )}
                  {version.status === 'PUBLISHED' && (
                    <Button loading={submitting} onClick={() => void handleNewDraft()}>
                      Create New Draft Version
                    </Button>
                  )}
                </>
              ) : (
                <Empty description="Save Basics first." style={{ paddingTop: 48 }} />
              ))}
          </div>
        </Flex>
      </Card>
    </div>
  )
}
