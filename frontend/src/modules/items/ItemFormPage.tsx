import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import {
  Alert,
  Breadcrumb,
  Button,
  Card,
  Checkbox,
  Flex,
  Form,
  Input,
  Modal,
  Radio,
  Select,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { ApiError } from '../../shared/api/http'
import { listCustomerProductMappings } from '../customer-mappings/api'
import type { CustomerProductMapping } from '../customer-mappings/types'
import {
  createItem,
  createMaterialType,
  createProductType,
  getItem,
  listMaterialTypes,
  listProductTypes,
  listUOMs,
  updateItem,
} from './api'
import {
  HIDDEN_FIELDS_BY_CLASS,
  ITEM_CLASS_OPTIONS,
  LOT_TRACKING_OPTIONS,
  REQUIRED_FIELDS_BY_CLASS,
} from './types'
import type { ItemClass, ItemFormValues, MaterialType, ProductType, UOM } from './types'

const { Title } = Typography
const { TextArea } = Input

/** A minimal "name only" create modal for master data that's rarely
 * created and shouldn't need a trip away from the Item form — Product
 * Type and Material Type both fit this (id/name/is_active only). */
function QuickAddModal({
  open,
  title,
  submitting,
  onCancel,
  onCreate,
}: {
  open: boolean
  title: string
  submitting: boolean
  onCancel: () => void
  onCreate: (name: string) => void
}) {
  const [name, setName] = useState('')

  useEffect(() => {
    if (open) setName('')
  }, [open])

  const submit = () => {
    if (name.trim()) onCreate(name.trim())
  }

  return (
    <Modal
      title={title}
      open={open}
      onCancel={onCancel}
      onOk={submit}
      okText="Create"
      confirmLoading={submitting}
      destroyOnHidden
    >
      <Input
        autoFocus
        placeholder="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onPressEnter={submit}
      />
    </Modal>
  )
}

export default function ItemFormPage() {
  const { id } = useParams<{ id: string }>()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const [form] = Form.useForm<ItemFormValues>()
  const [loading, setLoading] = useState(isEdit)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [productTypes, setProductTypes] = useState<ProductType[]>([])
  const [materialTypes, setMaterialTypes] = useState<MaterialType[]>([])
  const [uoms, setUoms] = useState<UOM[]>([])
  const [mappings, setMappings] = useState<CustomerProductMapping[]>([])
  const [productTypeModalOpen, setProductTypeModalOpen] = useState(false)
  const [materialTypeModalOpen, setMaterialTypeModalOpen] = useState(false)
  const [quickAddSubmitting, setQuickAddSubmitting] = useState(false)

  const itemClass = Form.useWatch('item_class', form) as ItemClass | undefined
  const required = itemClass ? REQUIRED_FIELDS_BY_CLASS[itemClass] : []
  const hidden = itemClass ? HIDDEN_FIELDS_BY_CLASS[itemClass] : []

  useEffect(() => {
    listProductTypes({ isActive: true }).then((response) => setProductTypes(response.results))
    listMaterialTypes({ isActive: true }).then((response) => setMaterialTypes(response.results))
    listUOMs({ isActive: true }).then((response) => setUoms(response.results))
  }, [])

  useEffect(() => {
    if (!id) return
    getItem(Number(id))
      .then((item) => form.setFieldsValue(item))
      .catch(() => setError('Could not load this item.'))
      .finally(() => setLoading(false))
    listCustomerProductMappings({ item: Number(id) }).then((response) =>
      setMappings(response.results),
    )
  }, [id, form])

  const handleSubmit = async (values: ItemFormValues) => {
    setError(null)
    setSubmitting(true)
    try {
      if (id) {
        await updateItem(Number(id), values)
      } else {
        await createItem(values)
      }
      navigate('/items')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this item.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleCreateProductType = async (name: string) => {
    setQuickAddSubmitting(true)
    try {
      const created = await createProductType({ name, is_active: true })
      setProductTypes((prev) => [...prev, created])
      form.setFieldValue('product_type', created.id)
      setProductTypeModalOpen(false)
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : 'Could not create this product type.')
    } finally {
      setQuickAddSubmitting(false)
    }
  }

  const handleCreateMaterialType = async (name: string) => {
    setQuickAddSubmitting(true)
    try {
      const created = await createMaterialType({ name, is_active: true })
      setMaterialTypes((prev) => [...prev, created])
      form.setFieldValue('material_type', created.id)
      setMaterialTypeModalOpen(false)
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : 'Could not create this material.')
    } finally {
      setQuickAddSubmitting(false)
    }
  }

  const pageTitle = isEdit ? 'Edit Item' : 'Create Item'

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 12 }}
        items={[
          { title: <Link to="/settings">Settings</Link> },
          { title: <Link to="/items">Items</Link> },
          { title: pageTitle },
        ]}
      />
      <Card style={{ maxWidth: 720, margin: '0 auto' }}>
        <Title level={4}>{pageTitle}</Title>
        {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}
        <Form<ItemFormValues>
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          disabled={loading || submitting}
          initialValues={{
            is_active: true,
            item_class: 'FINISHED_GOOD',
            lot_tracking: 'NONE',
            purchasable: false,
            manufacturable: false,
            stockable: false,
            sellable: false,
          }}
        >
          <Form.Item
            label="What should this item be called?"
            name="name"
            rules={[{ required: true, message: 'Enter an item name.' }]}
          >
            <Input size="large" />
          </Form.Item>
          <Form.Item
            label="Item Code"
            name="code"
            rules={[{ required: true, message: 'Enter an item code.' }]}
          >
            <Input size="large" disabled={isEdit} />
          </Form.Item>
          <Form.Item
            label="What kind of item is this?"
            name="item_class"
            rules={[{ required: true, message: 'Select an item class.' }]}
          >
            <Radio.Group options={ITEM_CLASS_OPTIONS} optionType="button" />
          </Form.Item>

          {!hidden.includes('product_type') && (
            <Form.Item label="Product Type" required={required.includes('product_type')}>
              <Flex gap={8} style={{ maxWidth: 320 }}>
                <Form.Item
                  name="product_type"
                  noStyle
                  rules={
                    required.includes('product_type')
                      ? [{ required: true, message: 'Select a product type.' }]
                      : []
                  }
                >
                  <Select
                    allowClear
                    size="large"
                    style={{ flex: 1, minWidth: 0 }}
                    options={productTypes.map((t) => ({ value: t.id, label: t.name }))}
                    showSearch
                    optionFilterProp="label"
                  />
                </Form.Item>
                <Button
                  size="large"
                  icon={<PlusOutlined />}
                  aria-label="Add Product Type"
                  onClick={() => setProductTypeModalOpen(true)}
                />
              </Flex>
            </Form.Item>
          )}
          {!hidden.includes('material_type') && (
            <Form.Item label="Material" required={required.includes('material_type')}>
              <Flex gap={8} style={{ maxWidth: 320 }}>
                <Form.Item
                  name="material_type"
                  noStyle
                  rules={
                    required.includes('material_type')
                      ? [{ required: true, message: 'Select a material.' }]
                      : []
                  }
                >
                  <Select
                    allowClear
                    size="large"
                    style={{ flex: 1, minWidth: 0 }}
                    options={materialTypes.map((t) => ({ value: t.id, label: t.name }))}
                    showSearch
                    optionFilterProp="label"
                  />
                </Form.Item>
                <Button
                  size="large"
                  icon={<PlusOutlined />}
                  aria-label="Add Material"
                  onClick={() => setMaterialTypeModalOpen(true)}
                />
              </Flex>
            </Form.Item>
          )}
          <Form.Item
            label="Inventory Unit"
            name="inventory_uom"
            rules={
              required.includes('inventory_uom')
                ? [{ required: true, message: 'Select a unit.' }]
                : []
            }
          >
            <Select
              allowClear
              size="large"
              style={{ maxWidth: 320 }}
              options={uoms.map((u) => ({ value: u.id, label: `${u.name} (${u.code})` }))}
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>

          <Form.Item label="Description (optional)" name="description">
            <TextArea rows={2} />
          </Form.Item>

          <Form.Item
            label="How is it used?"
            tooltip="Collapses into the Usage tags shown on the Items list — not raw checkboxes there."
          >
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <Form.Item name="manufacturable" valuePropName="checked" noStyle>
                <Checkbox>Made</Checkbox>
              </Form.Item>
              <Form.Item name="stockable" valuePropName="checked" noStyle>
                <Checkbox>Stocked</Checkbox>
              </Form.Item>
              <Form.Item name="sellable" valuePropName="checked" noStyle>
                <Checkbox>Sold</Checkbox>
              </Form.Item>
              <Form.Item name="purchasable" valuePropName="checked" noStyle>
                <Checkbox>Bought</Checkbox>
              </Form.Item>
            </div>
          </Form.Item>

          <Form.Item label="Lot Tracking" name="lot_tracking">
            <Select size="large" style={{ maxWidth: 240 }} options={LOT_TRACKING_OPTIONS} />
          </Form.Item>

          <Form.Item label="Active" name="is_active" valuePropName="checked">
            <Switch />
          </Form.Item>

          <Form.Item style={{ marginTop: 24 }}>
            <Button type="primary" htmlType="submit" size="large" loading={submitting}>
              {isEdit ? 'Save' : 'Create Item'}
            </Button>
          </Form.Item>
        </Form>
      </Card>
      {isEdit && (
        <Card style={{ maxWidth: 720, margin: '16px auto 0' }}>
          <Title level={5} style={{ marginTop: 0 }}>
            Mapped Customers
          </Title>
          <Table<CustomerProductMapping>
            rowKey="id"
            size="small"
            dataSource={mappings}
            pagination={false}
            locale={{ emptyText: 'No customers mapped to this item yet.' }}
            onRow={(record) => ({
              onClick: () => navigate(`/customer-product-mappings/${record.id}/edit`),
              style: { cursor: 'pointer' },
            })}
            columns={[
              { title: 'Customer', dataIndex: 'customer_name' },
              { title: 'Customer SKU', dataIndex: 'customer_sku' },
              {
                title: 'Status',
                render: (_, r) =>
                  r.current_version ? (
                    <Tag color={r.current_version.status === 'PUBLISHED' ? 'green' : 'default'}>
                      v{r.current_version.version_number} — {r.current_version.status}
                    </Tag>
                  ) : (
                    '—'
                  ),
              },
            ]}
          />
        </Card>
      )}
      <QuickAddModal
        open={productTypeModalOpen}
        title="Add Product Type"
        submitting={quickAddSubmitting}
        onCancel={() => setProductTypeModalOpen(false)}
        onCreate={(name) => void handleCreateProductType(name)}
      />
      <QuickAddModal
        open={materialTypeModalOpen}
        title="Add Material"
        submitting={quickAddSubmitting}
        onCancel={() => setMaterialTypeModalOpen(false)}
        onCreate={(name) => void handleCreateMaterialType(name)}
      />
    </div>
  )
}
