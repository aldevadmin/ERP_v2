import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import {
  Alert,
  Breadcrumb,
  Button,
  Card,
  Divider,
  Form,
  Input,
  InputNumber,
  Radio,
  Select,
  Space,
  Typography,
  Upload,
} from 'antd'
import { UploadOutlined } from '@ant-design/icons'
import type { UploadFile, UploadProps } from 'antd/es/upload/interface'
import { ApiError } from '../../shared/api/http'
import { listCustomers } from '../customers/api'
import type { CustomerListItem } from '../customers/types'
import {
  createCustomerSkuMapping,
  deleteCustomerSkuMappingFile,
  getCustomerSkuMapping,
  listProducts,
  updateCustomerSkuMapping,
  uploadCustomerSkuMappingFile,
} from './api'
import { CARTON_PLY_RATING_OPTIONS } from './types'
import type {
  CustomerSKUMapping,
  CustomerSKUMappingFile,
  CustomerSKUMappingFileCategory,
  CustomerSKUMappingFormValues,
  Product,
} from './types'

const { Title, Text } = Typography
const { TextArea } = Input

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024
const ALLOWED_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
]

function CategoryUploader({
  mappingId,
  category,
  maxCount,
  files,
  onUploaded,
  onDeleted,
}: {
  mappingId: number
  category: CustomerSKUMappingFileCategory
  maxCount: number
  files: CustomerSKUMappingFile[]
  onUploaded: (file: CustomerSKUMappingFile) => void
  onDeleted: (fileId: number) => void
}) {
  const [error, setError] = useState<string | null>(null)

  const fileList: UploadFile[] = files.map((f) => ({
    uid: String(f.id),
    name: f.file.split('/').pop() ?? f.file,
    status: 'done',
    url: f.file,
  }))

  const beforeUpload: UploadProps['beforeUpload'] = (file) => {
    setError(null)
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError('File must be 5MB or smaller.')
      return Upload.LIST_IGNORE
    }
    if (!ALLOWED_CONTENT_TYPES.includes(file.type)) {
      setError('Only image files or PDF are allowed.')
      return Upload.LIST_IGNORE
    }
    if (files.length >= maxCount) {
      setError(`Maximum of ${maxCount} files reached.`)
      return Upload.LIST_IGNORE
    }
    return true
  }

  const customRequest: UploadProps['customRequest'] = async (options) => {
    try {
      const uploaded = await uploadCustomerSkuMappingFile(
        mappingId,
        category,
        options.file as File,
      )
      onUploaded(uploaded)
      options.onSuccess?.(uploaded)
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not upload file.'
      setError(message)
      options.onError?.(new Error(message))
    }
  }

  const handleRemove = async (file: UploadFile) => {
    await deleteCustomerSkuMappingFile(mappingId, Number(file.uid))
    onDeleted(Number(file.uid))
  }

  return (
    <div>
      <Upload
        fileList={fileList}
        beforeUpload={beforeUpload}
        customRequest={customRequest}
        onRemove={handleRemove}
        accept="image/*,.pdf"
        multiple
      >
        {files.length < maxCount && <Button icon={<UploadOutlined />}>Upload (max {maxCount})</Button>}
      </Upload>
      {error && (
        <Text type="danger" style={{ fontSize: 12 }}>
          {error}
        </Text>
      )}
    </div>
  )
}

export default function CustomerSkuMappingFormPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [form] = Form.useForm<CustomerSKUMappingFormValues>()
  const [mapping, setMapping] = useState<CustomerSKUMapping | null>(null)
  const [customers, setCustomers] = useState<CustomerListItem[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(Boolean(id))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasRetailSticker = Form.useWatch('has_retail_sticker', form)

  useEffect(() => {
    listCustomers({ isActive: true }).then((response) => setCustomers(response.results))
    listProducts({ isActive: true }).then((response) => setProducts(response.results))
  }, [])

  useEffect(() => {
    if (!id) return
    getCustomerSkuMapping(Number(id))
      .then((data) => {
        setMapping(data)
        form.setFieldsValue(data)
      })
      .catch(() => setError('Could not load this mapping.'))
      .finally(() => setLoading(false))
  }, [id, form])

  const handleSubmit = async (values: CustomerSKUMappingFormValues) => {
    setError(null)
    setSubmitting(true)
    try {
      if (mapping) {
        const updated = await updateCustomerSkuMapping(mapping.id, values)
        setMapping(updated)
      } else {
        const created = await createCustomerSkuMapping(values)
        setMapping(created)
        navigate(`/products/mappings/${created.id}/edit`, { replace: true })
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save mapping.')
    } finally {
      setSubmitting(false)
    }
  }

  const filesByCategory = (category: CustomerSKUMappingFileCategory) =>
    mapping?.files.filter((f) => f.category === category) ?? []

  const addFile = (file: CustomerSKUMappingFile) => {
    setMapping((prev) => (prev ? { ...prev, files: [...prev.files, file] } : prev))
  }

  const removeFile = (fileId: number) => {
    setMapping((prev) =>
      prev ? { ...prev, files: prev.files.filter((f) => f.id !== fileId) } : prev,
    )
  }

  const pageTitle = mapping ? 'Edit Mapping' : 'New Mapping'

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 12 }}
        items={[
          { title: <Link to="/settings">Settings</Link> },
          { title: <Link to="/products/mappings">Customer SKU Mappings</Link> },
          { title: pageTitle },
        ]}
      />
      <Card style={{ maxWidth: 900, margin: '0 auto' }} loading={loading}>
        <Title level={4}>{pageTitle}</Title>
      {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}
      <Form<CustomerSKUMappingFormValues>
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        disabled={loading || submitting}
      >
        <Divider titlePlacement="left">Identity</Divider>
        <Form.Item
          label="Customer"
          name="customer"
          rules={[{ required: true, message: 'Select a customer.' }]}
        >
          <Select
            options={customers.map((c) => ({ value: c.id, label: `${c.name} (${c.code})` }))}
            showSearch
            optionFilterProp="label"
          />
        </Form.Item>
        <Form.Item
          label="Customer SKU Code"
          name="customer_sku_code"
          rules={[{ required: true, message: 'Enter the customer SKU code.' }]}
        >
          <Input />
        </Form.Item>
        <Form.Item label="Customer Description" name="customer_description">
          <Input />
        </Form.Item>
        <Form.Item
          label="Internal SKU"
          name="product"
          rules={[{ required: true, message: 'Select the internal SKU.' }]}
        >
          <Select
            options={products.map((p) => ({ value: p.id, label: `${p.name} (${p.sku_code})` }))}
            showSearch
            optionFilterProp="label"
          />
        </Form.Item>

        <Divider titlePlacement="left">Packing Configuration</Divider>
        <Space size="large" align="start" wrap>
          <Form.Item label="Pieces per Pouch" name="pieces_per_pouch">
            <InputNumber min={0} style={{ width: 160 }} />
          </Form.Item>
          <Form.Item label="Pouches per Carton" name="pouches_per_carton">
            <InputNumber min={0} style={{ width: 160 }} />
          </Form.Item>
        </Space>
        <Form.Item label="Pouch Height (in inches)" name="pouch_height_inches">
          <InputNumber min={0} style={{ width: 160 }} />
        </Form.Item>

        <Divider titlePlacement="left">Carton Configuration</Divider>
        <Space size="large" align="start" wrap>
          <Form.Item label="Carton Ply Rating" name="carton_ply_rating">
            <Select allowClear options={CARTON_PLY_RATING_OPTIONS} style={{ width: 140 }} />
          </Form.Item>
          <Form.Item label="Length (mm)" name="carton_length_mm">
            <InputNumber min={0} style={{ width: 130 }} />
          </Form.Item>
          <Form.Item label="Breadth (mm)" name="carton_breadth_mm">
            <InputNumber min={0} style={{ width: 130 }} />
          </Form.Item>
          <Form.Item label="Height (mm)" name="carton_height_mm">
            <InputNumber min={0} style={{ width: 130 }} />
          </Form.Item>
          <Form.Item label="Net Weight (kg)" name="carton_net_weight_kg">
            <InputNumber min={0} style={{ width: 140 }} />
          </Form.Item>
          <Form.Item label="Gross Weight (kg)" name="carton_gross_weight_kg">
            <InputNumber min={0} style={{ width: 140 }} />
          </Form.Item>
        </Space>

        <Divider titlePlacement="left">Pouch Configuration</Divider>
        <Space size="large" align="start" wrap>
          <Form.Item label="Thickness (microns)" name="pouch_thickness_microns">
            <InputNumber min={0} style={{ width: 150 }} />
          </Form.Item>
          <Form.Item label="Length (mm)" name="pouch_length_mm">
            <InputNumber min={0} style={{ width: 130 }} />
          </Form.Item>
          <Form.Item label="Breadth (mm)" name="pouch_breadth_mm">
            <InputNumber min={0} style={{ width: 130 }} />
          </Form.Item>
          <Form.Item label="Height (mm)" name="pouch_height_mm">
            <InputNumber min={0} style={{ width: 130 }} />
          </Form.Item>
        </Space>

        <Divider titlePlacement="left">Retail Stickers</Divider>
        <Form.Item label="Retail Sticker Required?" name="has_retail_sticker">
          <Radio.Group>
            <Radio value={true}>Yes</Radio>
            <Radio value={false}>No</Radio>
          </Radio.Group>
        </Form.Item>
        {hasRetailSticker === true && (
          <>
            <Form.Item label="Comments" name="retail_sticker_comments">
              <TextArea rows={2} />
            </Form.Item>
            <Form.Item label="Retail Sticker Images">
              {mapping ? (
                <CategoryUploader
                  mappingId={mapping.id}
                  category="RETAIL_STICKER_IMAGE"
                  maxCount={3}
                  files={filesByCategory('RETAIL_STICKER_IMAGE')}
                  onUploaded={addFile}
                  onDeleted={removeFile}
                />
              ) : (
                <Text type="secondary">Save the mapping first to attach images.</Text>
              )}
            </Form.Item>
          </>
        )}

        <Divider titlePlacement="left">Silica Gel</Divider>
        <Form.Item label="Silica Gel Required?" name="has_silica_gel">
          <Radio.Group>
            <Radio value={true}>Yes</Radio>
            <Radio value={false}>No</Radio>
          </Radio.Group>
        </Form.Item>

        <Divider titlePlacement="left">Other Packing Instructions</Divider>
        <Form.Item label="Other Packing Instructions" name="other_packing_requirements">
          <TextArea rows={2} />
        </Form.Item>

        <Divider titlePlacement="left">Images &amp; Files</Divider>
        {mapping ? (
          <Space orientation="vertical" size="large" style={{ width: '100%' }}>
            <Form.Item label="Plate Image">
              <CategoryUploader
                mappingId={mapping.id}
                category="PLATE_IMAGE"
                maxCount={10}
                files={filesByCategory('PLATE_IMAGE')}
                onUploaded={addFile}
                onDeleted={removeFile}
              />
            </Form.Item>
            <Form.Item label="Pouch Image">
              <CategoryUploader
                mappingId={mapping.id}
                category="POUCH_IMAGE"
                maxCount={10}
                files={filesByCategory('POUCH_IMAGE')}
                onUploaded={addFile}
                onDeleted={removeFile}
              />
            </Form.Item>
            <Form.Item label="Design Files">
              <CategoryUploader
                mappingId={mapping.id}
                category="DESIGN_FILE"
                maxCount={10}
                files={filesByCategory('DESIGN_FILE')}
                onUploaded={addFile}
                onDeleted={removeFile}
              />
            </Form.Item>
          </Space>
        ) : (
          <Alert type="info" title="Save the mapping first to attach images or files." showIcon />
        )}

        <Form.Item style={{ marginTop: 24 }}>
          <Button type="primary" htmlType="submit" size="large" loading={submitting}>
            Save
          </Button>
        </Form.Item>
      </Form>
      </Card>
    </div>
  )
}
