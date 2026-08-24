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
  Tooltip,
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

const ITEM_CLASS_HELP: Record<ItemClass, string> = {
  RAW_MATERIAL:
    'Bought from outside and fed into your own process — whether truly raw, or already part-processed by a vendor (e.g. job-work pressing).',
  WIP: 'An in-between output your own process creates — not sellable yet. Only needed if you track/stock that intermediate stage separately (e.g. pressed blanks waiting to be trimmed). Single-step routes usually skip this entirely.',
  FINISHED_GOOD:
    'The final product you sell to a customer — what appears on Export Order lines and Customer Product Mappings.',
  PACKAGING_MATERIAL:
    'Pouches, cartons, labels — anything consumed while packing a Finished Good. Selectable in a Packaging Profile’s materials list.',
  CONSUMABLE:
    'Used up during production or packing but not part of the product itself — tape, gloves, cleaning supplies.',
  SCRAP_BY_PRODUCT:
    'Waste or secondary output from a process — trimmings, rejects — tracked but not sold as the main product.',
}

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
            tooltip="Shown throughout the app — on pickers, order lines, and reports. Use something recognizable on the factory floor, not an internal code."
            rules={[{ required: true, message: 'Enter an item name.' }]}
          >
            <Input size="large" />
          </Form.Item>
          <Form.Item
            label="Item Code"
            name="code"
            tooltip="A short, unique internal reference — your own part number. Fixed once created, since other records point back to this item by it."
            rules={[{ required: true, message: 'Enter an item code.' }]}
          >
            <Input size="large" disabled={isEdit} />
          </Form.Item>
          <Form.Item
            label="What kind of item is this?"
            name="item_class"
            tooltip="Raw Material = bought from outside; WIP = an in-between stage your own process makes; Finished Good = what you sell. Hover an option below for detail."
            rules={[{ required: true, message: 'Select an item class.' }]}
          >
            <Radio.Group optionType="button">
              {ITEM_CLASS_OPTIONS.map((option) => (
                <Tooltip key={option.value} title={ITEM_CLASS_HELP[option.value]}>
                  <Radio.Button value={option.value}>{option.label}</Radio.Button>
                </Tooltip>
              ))}
            </Radio.Group>
          </Form.Item>

          {!hidden.includes('product_type') && (
            <Form.Item
              label="Product Type"
              required={required.includes('product_type')}
              tooltip="What kind of product this is — e.g. Plate, Bowl, Tray. Just a label for grouping and filtering; doesn't change behavior. Rarely created — use the + only when the type you need isn't listed."
            >
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
            <Form.Item
              label="Material"
              required={required.includes('material_type')}
              tooltip="What the item is made from — e.g. Areca Palm, Wood Veneer. Also just a grouping label. Use the + to add one on the spot rather than leaving this trip."
            >
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
            tooltip="The unit stock is counted in before any packing — almost always Piece for finished goods. Packaging Profiles convert this into pouches/cartons for selling."
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

          <Form.Item
            label="Description (optional)"
            name="description"
            tooltip="Extra detail for your own reference — dimensions, notes, anything not worth a dedicated field. Not shown to customers."
          >
            <TextArea rows={2} />
          </Form.Item>

          <Form.Item
            label="How is it used?"
            tooltip="Collapses into the Usage tags shown on the Items list — not raw checkboxes there."
          >
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <Form.Item name="manufacturable" valuePropName="checked" noStyle>
                <Tooltip title="This item can be produced by a Process/Product Route — it's an output of manufacturing.">
                  <Checkbox>Made</Checkbox>
                </Tooltip>
              </Form.Item>
              <Form.Item name="stockable" valuePropName="checked" noStyle>
                <Tooltip title="You track an on-hand quantity for this item in inventory.">
                  <Checkbox>Stocked</Checkbox>
                </Tooltip>
              </Form.Item>
              <Form.Item name="sellable" valuePropName="checked" noStyle>
                <Tooltip title="This item can appear on an Export Order line and be mapped to a customer.">
                  <Checkbox>Sold</Checkbox>
                </Tooltip>
              </Form.Item>
              <Form.Item name="purchasable" valuePropName="checked" noStyle>
                <Tooltip title="This item is procured from a vendor.">
                  <Checkbox>Bought</Checkbox>
                </Tooltip>
              </Form.Item>
            </div>
          </Form.Item>

          <Form.Item
            label="Lot Tracking"
            name="lot_tracking"
            tooltip="Whether batches of this item need a lot/batch number for traceability. None — don't track by batch. Optional — a lot can be recorded but isn't required. Required — every unit must trace back to a production lot."
          >
            <Select size="large" style={{ maxWidth: 240 }} options={LOT_TRACKING_OPTIONS} />
          </Form.Item>

          <Form.Item
            label="Active"
            name="is_active"
            valuePropName="checked"
            tooltip="Turn off to hide this item from pickers without deleting it. Existing records that already reference it are unaffected."
          >
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
