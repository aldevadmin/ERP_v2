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
  Select,
  Switch,
  Table,
  Tag,
  Typography,
  Upload,
  message,
} from 'antd'
import { DeleteOutlined, UploadOutlined } from '@ant-design/icons'
import type { UploadFile, UploadProps } from 'antd/es/upload/interface'
import { ApiError } from '../../shared/api/http'
import { listCustomers } from '../customers/api'
import type { CustomerListItem } from '../customers/types'
import { listItems, listUOMs } from '../items/api'
import type { Item, UOM } from '../items/types'
import { listPackagingProfiles } from '../packaging/api'
import type { PackagingProfile } from '../packaging/types'
import {
  createCustomerProductMapping,
  deleteMappingFile,
  getCustomerProductMapping,
  getCustomerProductMappingVersion,
  newCustomerProductMappingDraft,
  publishCustomerProductMappingVersion,
  saveMappingRequirements,
  updateCustomerProductMapping,
  updateCustomerProductMappingVersion,
  uploadMappingFile,
} from './api'
import { REQUIREMENT_CATEGORY_OPTIONS } from './types'
import type {
  CustomerProductMapping,
  CustomerProductMappingFormValues,
  CustomerProductMappingVersion,
  MappingFile,
  MappingRequirementRow,
} from './types'

const { Title, Text } = Typography

const STEPS = [
  { key: 'customer_product', label: 'Customer & Product' },
  { key: 'commercial', label: 'Commercial' },
  { key: 'requirements', label: 'Requirements' },
  { key: 'preview', label: 'Preview' },
] as const
type StepKey = (typeof STEPS)[number]['key']

function FileUploader({
  versionId,
  files,
  onUploaded,
  onDeleted,
}: {
  versionId: number
  files: MappingFile[]
  onUploaded: (file: MappingFile) => void
  onDeleted: (fileId: number) => void
}) {
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileList: UploadFile[] = files.map((f) => ({
    uid: String(f.id),
    name: f.file.split('/').pop() ?? f.file,
    status: 'done',
    url: f.file,
  }))

  const customRequest: UploadProps['customRequest'] = async (options) => {
    try {
      const uploaded = await uploadMappingFile(versionId, 'PLATE_IMAGE', options.file as File)
      onUploaded(uploaded)
      options.onSuccess?.(uploaded)
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Could not upload file.'
      setUploadError(msg)
      options.onError?.(new Error(msg))
    }
  }

  const handleRemove = async (file: UploadFile) => {
    await deleteMappingFile(versionId, Number(file.uid))
    onDeleted(Number(file.uid))
  }

  return (
    <div>
      <Upload fileList={fileList} customRequest={customRequest} onRemove={handleRemove} accept="image/*,.pdf" multiple>
        <Button icon={<UploadOutlined />}>Upload</Button>
      </Upload>
      {uploadError && (
        <Text type="danger" style={{ fontSize: 12 }}>
          {uploadError}
        </Text>
      )}
    </div>
  )
}

export default function CustomerProductMappingFormPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isEdit = Boolean(id)
  const [basicsForm] = Form.useForm<CustomerProductMappingFormValues>()
  const [commercialForm] = Form.useForm()

  const [mapping, setMapping] = useState<CustomerProductMapping | null>(null)
  const [version, setVersion] = useState<CustomerProductMappingVersion | null>(null)
  const [currentStep, setCurrentStep] = useState<StepKey>('customer_product')
  const [loading, setLoading] = useState(isEdit)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [customers, setCustomers] = useState<CustomerListItem[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [packagingProfiles, setPackagingProfiles] = useState<PackagingProfile[]>([])
  const [uoms, setUoms] = useState<UOM[]>([])
  const [requirementRows, setRequirementRows] = useState<MappingRequirementRow[]>([])

  const editable = !version || version.status === 'DRAFT'

  useEffect(() => {
    listCustomers({ isActive: true }).then((response) => setCustomers(response.results))
    listItems({ isActive: true }).then((response) =>
      setItems(response.results.filter((i) => i.item_class === 'WIP' || i.item_class === 'FINISHED_GOOD')),
    )
    listPackagingProfiles({ isActive: true }).then((response) =>
      setPackagingProfiles(response.results.filter((p) => p.current_version?.status === 'PUBLISHED')),
    )
    listUOMs({ isActive: true }).then((response) => setUoms(response.results))
  }, [])

  const loadVersion = useCallback(
    (versionId: number) => {
      getCustomerProductMappingVersion(versionId).then((v) => {
        setVersion(v)
        commercialForm.setFieldsValue(v)
        setRequirementRows(
          v.requirements.map((r) => ({
            id: r.id,
            category: r.category,
            key: r.key,
            value: r.value,
            is_required: r.is_required,
            sort_order: r.sort_order,
          })),
        )
      })
    },
    [commercialForm],
  )

  useEffect(() => {
    if (!id) return
    getCustomerProductMapping(Number(id))
      .then((data) => {
        setMapping(data)
        basicsForm.setFieldsValue(data)
        if (data.current_version) loadVersion(data.current_version.id)
      })
      .catch(() => setError('Could not load this mapping.'))
      .finally(() => setLoading(false))
  }, [id, basicsForm, loadVersion])

  const saveBasics = async () => {
    let values: CustomerProductMappingFormValues
    try {
      values = await basicsForm.validateFields()
    } catch {
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      if (mapping) {
        const updated = await updateCustomerProductMapping(mapping.id, values)
        setMapping(updated)
      } else {
        const created = await createCustomerProductMapping(values)
        setMapping(created)
        if (created.current_version) loadVersion(created.current_version.id)
        navigate(`/customer-product-mappings/${created.id}/edit`, { replace: true })
      }
      setCurrentStep('commercial')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this mapping.')
    } finally {
      setSubmitting(false)
    }
  }

  const saveCommercial = async () => {
    if (!version) return
    let values: Record<string, unknown>
    try {
      values = await commercialForm.validateFields()
    } catch {
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      const saved = await updateCustomerProductMappingVersion(version.id, values)
      setVersion(saved)
      setCurrentStep('requirements')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save commercial terms.')
    } finally {
      setSubmitting(false)
    }
  }

  const saveRequirements = async () => {
    if (!version) return
    setError(null)
    setSubmitting(true)
    try {
      const saved = await saveMappingRequirements(version.id, requirementRows)
      setVersion(saved)
      setCurrentStep('preview')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save requirements.')
    } finally {
      setSubmitting(false)
    }
  }

  const handlePublish = async () => {
    if (!version) return
    setError(null)
    setSubmitting(true)
    try {
      const published = await publishCustomerProductMappingVersion(version.id)
      setVersion(published)
      message.success('Mapping published.')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not publish this mapping.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleNewDraft = async () => {
    if (!version) return
    setSubmitting(true)
    try {
      const draft = await newCustomerProductMappingDraft(version.id)
      loadVersion(draft.id)
      message.success('New draft version created.')
      setCurrentStep('commercial')
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : 'Could not create a new draft.')
    } finally {
      setSubmitting(false)
    }
  }

  const addRequirementRow = () => {
    setRequirementRows((prev) => [
      ...prev,
      { category: 'OTHER', key: '', value: '', is_required: true, sort_order: prev.length },
    ])
  }

  const updateRequirementRow = (index: number, patch: Partial<MappingRequirementRow>) => {
    setRequirementRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  const removeRequirementRow = (index: number) => {
    setRequirementRows((prev) => prev.filter((_, i) => i !== index))
  }

  const addFile = (file: MappingFile) => {
    setVersion((prev) => (prev ? { ...prev, files: [...prev.files, file] } : prev))
  }
  const removeFile = (fileId: number) => {
    setVersion((prev) => (prev ? { ...prev, files: prev.files.filter((f) => f.id !== fileId) } : prev))
  }

  const pageTitle = isEdit ? 'Edit Mapping' : 'Create Mapping'

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 12 }}
        items={[
          { title: <Link to="/settings">Settings</Link> },
          { title: <Link to="/customer-product-mappings">Customer Product Mappings</Link> },
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
                onClick={() => setCurrentStep(step.key)}
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

            {currentStep === 'customer_product' && (
              <Form<CustomerProductMappingFormValues>
                form={basicsForm}
                layout="vertical"
                disabled={loading || !editable}
                initialValues={{ is_active: true }}
              >
                <Form.Item label="Customer" name="customer" rules={[{ required: true, message: 'Select a customer.' }]}>
                  <Select
                    size="large"
                    showSearch
                    optionFilterProp="label"
                    options={customers.map((c) => ({ value: c.id, label: `${c.name} (${c.code})` }))}
                  />
                </Form.Item>
                <Form.Item label="Item" name="item" rules={[{ required: true, message: 'Select an item.' }]}>
                  <Select
                    size="large"
                    showSearch
                    optionFilterProp="label"
                    options={items.map((i) => ({ value: i.id, label: `${i.name} (${i.code})` }))}
                  />
                </Form.Item>
                <Form.Item
                  label="Customer SKU"
                  name="customer_sku"
                  tooltip="What this customer calls this specific pack — fixed once created, since it's what identifies this mapping. To correct or change it, create a new mapping."
                  rules={[{ required: true, message: 'Enter the customer SKU.' }]}
                >
                  <Input size="large" disabled={isEdit} />
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

            {currentStep === 'commercial' &&
              (version ? (
                <Form form={commercialForm} layout="vertical" disabled={!editable}>
                  <Form.Item label="Customer Description" name="customer_description">
                    <Input size="large" />
                  </Form.Item>
                  <Form.Item
                    label="Packaging Profile"
                    name="packaging_profile_version"
                    rules={[{ required: true, message: 'Select a published packaging profile.' }]}
                    tooltip="Only published packaging profiles can be pinned — republishing packaging later never silently changes this mapping."
                  >
                    <Select
                      size="large"
                      showSearch
                      optionFilterProp="label"
                      options={packagingProfiles.map((p) => ({
                        value: p.current_version!.id,
                        label: `${p.name} (v${p.current_version!.version_number})`,
                      }))}
                    />
                  </Form.Item>
                  <Form.Item
                    label="Selling Unit"
                    name="selling_uom"
                    rules={[{ required: true, message: 'Select a selling unit.' }]}
                  >
                    <Select
                      size="large"
                      style={{ maxWidth: 240 }}
                      showSearch
                      optionFilterProp="label"
                      options={uoms.map((u) => ({ value: u.id, label: `${u.name} (${u.code})` }))}
                    />
                  </Form.Item>
                  <Flex gap={16} wrap="wrap">
                    <Form.Item label="Unit Price" name="unit_price">
                      <InputNumber min={0} style={{ width: 160 }} />
                    </Form.Item>
                    <Form.Item label="Currency" name="currency">
                      <Input style={{ width: 100 }} maxLength={3} placeholder="USD" />
                    </Form.Item>
                    <Form.Item label="Barcode" name="barcode">
                      <Input style={{ width: 200 }} />
                    </Form.Item>
                  </Flex>
                  <Flex justify="end">
                    <Button
                      type="primary"
                      loading={submitting}
                      disabled={!editable}
                      onClick={() => void saveCommercial()}
                    >
                      Save &amp; Continue →
                    </Button>
                  </Flex>
                </Form>
              ) : (
                <Empty description="Save Customer &amp; Product first." style={{ paddingTop: 48 }} />
              ))}

            {currentStep === 'requirements' &&
              (version ? (
                <>
                  <Text strong style={{ display: 'block', marginBottom: 16 }}>
                    What does this customer require — labels, documents, quality, pallet, compliance?
                  </Text>
                  <Table<MappingRequirementRow>
                    rowKey={(_, i) => String(i)}
                    dataSource={requirementRows}
                    pagination={false}
                    locale={{ emptyText: 'No requirements yet.' }}
                    columns={[
                      {
                        title: 'Category',
                        dataIndex: 'category',
                        render: (value, _row, index) => (
                          <Select
                            style={{ width: 140 }}
                            disabled={!editable}
                            value={value}
                            options={REQUIREMENT_CATEGORY_OPTIONS}
                            onChange={(v) => updateRequirementRow(index, { category: v })}
                          />
                        ),
                      },
                      {
                        title: 'Requirement',
                        dataIndex: 'key',
                        render: (value, _row, index) => (
                          <Input
                            disabled={!editable}
                            value={value}
                            onChange={(e) => updateRequirementRow(index, { key: e.target.value })}
                          />
                        ),
                      },
                      {
                        title: 'Detail',
                        dataIndex: 'value',
                        render: (value, _row, index) => (
                          <Input
                            disabled={!editable}
                            value={value}
                            onChange={(e) => updateRequirementRow(index, { value: e.target.value })}
                          />
                        ),
                      },
                      {
                        title: 'Required?',
                        dataIndex: 'is_required',
                        width: 100,
                        render: (value, _row, index) => (
                          <Switch
                            disabled={!editable}
                            checked={value}
                            onChange={(v) => updateRequirementRow(index, { is_required: v })}
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
                              onClick={() => removeRequirementRow(index)}
                            />
                          ),
                      },
                    ]}
                  />
                  {editable && (
                    <Button style={{ marginTop: 12 }} onClick={addRequirementRow}>
                      + Add Requirement
                    </Button>
                  )}

                  <Text strong style={{ display: 'block', margin: '24px 0 12px' }}>
                    Reference Images / Files
                  </Text>
                  <FileUploader versionId={version.id} files={version.files} onUploaded={addFile} onDeleted={removeFile} />

                  <Flex justify="end" style={{ marginTop: 24 }}>
                    <Button
                      type="primary"
                      loading={submitting}
                      disabled={!editable}
                      onClick={() => void saveRequirements()}
                    >
                      Save &amp; Continue →
                    </Button>
                  </Flex>
                </>
              ) : (
                <Empty description="Save Customer &amp; Product first." style={{ paddingTop: 48 }} />
              ))}

            {currentStep === 'preview' &&
              (version ? (
                <>
                  <Descriptions column={1} bordered size="small" style={{ marginBottom: 24 }}>
                    <Descriptions.Item label="Status">{version.status}</Descriptions.Item>
                    <Descriptions.Item label="Customer SKU">{mapping?.customer_sku || '—'}</Descriptions.Item>
                    <Descriptions.Item label="Packaging Profile">
                      {version.packaging_profile_name
                        ? `${version.packaging_profile_name} (v${version.packaging_profile_version_number})`
                        : '—'}
                    </Descriptions.Item>
                    <Descriptions.Item label="Selling Unit">{version.selling_uom_code || '—'}</Descriptions.Item>
                    <Descriptions.Item label="Unit Price">
                      {version.unit_price ? `${version.unit_price} ${version.currency}` : '—'}
                    </Descriptions.Item>
                    <Descriptions.Item label="Requirements">{version.requirements.length}</Descriptions.Item>
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
                <Empty description="Save Customer &amp; Product first." style={{ paddingTop: 48 }} />
              ))}
          </div>
        </Flex>
      </Card>
    </div>
  )
}
