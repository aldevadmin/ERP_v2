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
  InputNumber,
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
import { InfoCircleOutlined, PlusOutlined } from '@ant-design/icons'
import { ApiError } from '../../shared/api/http'
import { listCustomerProductMappings } from '../customer-mappings/api'
import type { CustomerProductMapping } from '../customer-mappings/types'
import {
  createItem,
  createMaterialType,
  createProductType,
  createShape,
  getItem,
  listItemFieldRules,
  listMaterialTypes,
  listNamingTemplates,
  listProductTypes,
  listShapes,
  listUOMs,
  updateItem,
} from './api'
import { applyTemplate, buildDimensionToken, resolveNamingTemplate } from './namingTemplate'
import type { NamingTokens } from './namingTemplate'
import {
  fieldRulesForClass,
  isApplicableToClass,
  ITEM_CLASS_OPTIONS,
  ITEM_CLASS_SHORT_LABELS,
  LOT_TRACKING_OPTIONS,
} from './types'
import type {
  Item,
  ItemClass,
  ItemFieldRule,
  ItemFormValues,
  MaterialType,
  NamingTemplate,
  ProductType,
  Shape,
  UOM,
} from './types'

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
 * Type, Material Type, and Shape all fit this (id/name/is_active only). */
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

function Suggestion({ value, onUse }: { value: string | null; onUse: () => void }) {
  if (!value) return null
  return (
    <div style={{ marginTop: -16, marginBottom: 16, fontSize: 13, color: '#8c8c8c' }}>
      Suggested: <span style={{ fontFamily: 'monospace' }}>{value}</span>{' '}
      <Typography.Link onClick={onUse}>Use</Typography.Link>
    </div>
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
  const [shapes, setShapes] = useState<Shape[]>([])
  const [uoms, setUoms] = useState<UOM[]>([])
  const [namingTemplates, setNamingTemplates] = useState<NamingTemplate[]>([])
  const [fieldRules, setFieldRules] = useState<ItemFieldRule[]>([])
  const [mappings, setMappings] = useState<CustomerProductMapping[]>([])
  const [productTypeModalOpen, setProductTypeModalOpen] = useState(false)
  const [materialTypeModalOpen, setMaterialTypeModalOpen] = useState(false)
  const [shapeModalOpen, setShapeModalOpen] = useState(false)
  const [quickAddSubmitting, setQuickAddSubmitting] = useState(false)

  const itemClass = Form.useWatch('item_class', form) as ItemClass | undefined
  const productType = Form.useWatch('product_type', form) as number | null | undefined
  const materialType = Form.useWatch('material_type', form) as number | null | undefined
  const shape = Form.useWatch('shape', form) as number | null | undefined
  const lengthIn = Form.useWatch('length_in', form) as number | null | undefined
  const breadthIn = Form.useWatch('breadth_in', form) as number | null | undefined
  const heightMm = Form.useWatch('height_mm', form) as number | null | undefined
  const inventoryUom = Form.useWatch('inventory_uom', form) as number | null | undefined

  const rules = itemClass ? fieldRulesForClass(fieldRules, itemClass) : {}
  const required: ('product_type' | 'material_type' | 'inventory_uom')[] = [
    'inventory_uom',
    ...(rules.product_type === 'REQUIRED' ? (['product_type'] as const) : []),
    ...(rules.material_type === 'REQUIRED' ? (['material_type'] as const) : []),
  ]
  const hidden: ('product_type' | 'material_type')[] = [
    ...(rules.product_type === 'HIDDEN' ? (['product_type'] as const) : []),
    ...(rules.material_type === 'HIDDEN' ? (['material_type'] as const) : []),
  ]
  const showShape = rules.shape !== 'HIDDEN' && rules.shape !== undefined
  const showDimensions = rules.dimensions !== 'HIDDEN' && rules.dimensions !== undefined
  const requireShape = rules.shape === 'REQUIRED'
  const requireDimensions = rules.dimensions === 'REQUIRED'

  useEffect(() => {
    listProductTypes({ isActive: true }).then((response) => setProductTypes(response.results))
    listMaterialTypes({ isActive: true }).then((response) => setMaterialTypes(response.results))
    listShapes({ isActive: true }).then((response) => setShapes(response.results))
    listUOMs({ isActive: true }).then((response) => setUoms(response.results))
    listNamingTemplates({ isActive: true }).then((response) => setNamingTemplates(response.results))
    listItemFieldRules().then(setFieldRules)
  }, [])

  useEffect(() => {
    if (!id) return
    getItem(Number(id))
      .then((item: Item) =>
        form.setFieldsValue({
          ...item,
          length_in: item.length_in != null ? Number(item.length_in) : null,
          breadth_in: item.breadth_in != null ? Number(item.breadth_in) : null,
          height_mm: item.height_mm != null ? Number(item.height_mm) : null,
        }),
      )
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
      const created = await createProductType({ name, short_code: '', is_active: true })
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
      const created = await createMaterialType({ name, short_code: '', is_active: true })
      setMaterialTypes((prev) => [...prev, created])
      form.setFieldValue('material_type', created.id)
      setMaterialTypeModalOpen(false)
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : 'Could not create this material.')
    } finally {
      setQuickAddSubmitting(false)
    }
  }

  const handleCreateShape = async (name: string) => {
    setQuickAddSubmitting(true)
    try {
      const created = await createShape({ name, short_code: '', is_active: true })
      setShapes((prev) => [...prev, created])
      form.setFieldValue('shape', created.id)
      setShapeModalOpen(false)
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : 'Could not create this shape.')
    } finally {
      setQuickAddSubmitting(false)
    }
  }

  const selectedProductType = productTypes.find((t) => t.id === productType)
  const selectedMaterialType = materialTypes.find((t) => t.id === materialType)
  const selectedShape = shapes.find((s) => s.id === shape)
  const selectedUom = uoms.find((u) => u.id === inventoryUom)

  const dimension = buildDimensionToken(
    lengthIn != null ? String(lengthIn) : undefined,
    breadthIn != null ? String(breadthIn) : undefined,
    heightMm != null ? String(heightMm) : undefined,
    selectedShape?.short_code,
  )

  const tokens: NamingTokens = {
    class: ITEM_CLASS_OPTIONS.find((option) => option.value === itemClass)?.label,
    class_short: itemClass ? ITEM_CLASS_SHORT_LABELS[itemClass] : undefined,
    product_type: selectedProductType?.name,
    product_type_short: selectedProductType?.short_code,
    material_type: selectedMaterialType?.name,
    material_type_short: selectedMaterialType?.short_code,
    shape: selectedShape?.name,
    shape_short: selectedShape?.short_code,
    length: lengthIn != null ? String(lengthIn) : undefined,
    breadth: breadthIn != null ? String(breadthIn) : undefined,
    height: heightMm != null ? String(heightMm) : undefined,
    uom: selectedUom?.code,
    dimension,
  }

  const matchedTemplate = resolveNamingTemplate(namingTemplates, itemClass, productType, shape)
  const suggestedName = matchedTemplate ? applyTemplate(matchedTemplate.name_pattern, tokens) : null
  const suggestedCode = matchedTemplate ? applyTemplate(matchedTemplate.code_pattern, tokens) : null

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
                    options={(itemClass
                      ? productTypes.filter((t) => isApplicableToClass(t, itemClass))
                      : productTypes
                    ).map((t) => ({ value: t.id, label: t.name }))}
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
                    options={(itemClass
                      ? materialTypes.filter((t) => isApplicableToClass(t, itemClass))
                      : materialTypes
                    ).map((t) => ({ value: t.id, label: t.name }))}
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

          {showShape && (
            <Form.Item
              label={requireShape ? 'Shape' : 'Shape (optional)'}
              required={requireShape}
              tooltip="Round, Square, Rectangle... — used together with Dimensions below to suggest a Name and Code."
            >
              <Flex gap={8} style={{ maxWidth: 320 }}>
                <Form.Item
                  name="shape"
                  noStyle
                  rules={requireShape ? [{ required: true, message: 'Select a shape.' }] : []}
                >
                  <Select
                    allowClear
                    size="large"
                    style={{ flex: 1, minWidth: 0 }}
                    options={shapes.map((s) => ({ value: s.id, label: s.name }))}
                    showSearch
                    optionFilterProp="label"
                  />
                </Form.Item>
                <Button
                  size="large"
                  icon={<PlusOutlined />}
                  aria-label="Add Shape"
                  onClick={() => setShapeModalOpen(true)}
                />
              </Flex>
            </Form.Item>
          )}

          {showDimensions && (
            <Form.Item
              label={requireDimensions ? 'Dimensions' : 'Dimensions (optional)'}
              required={requireDimensions}
              tooltip="Feeds the suggested Name/Code below. Length × Breadth for square/rectangular items, Length alone (as a diameter) for round ones — the diameter form needs a Shape, so it only applies where Shape is also shown. Breadth stays optional either way — a round item genuinely has none."
            >
              <Flex gap={12}>
                <Form.Item
                  name="length_in"
                  noStyle
                  rules={requireDimensions ? [{ required: true, message: 'Enter a length.' }] : []}
                >
                  <InputNumber min={0} addonAfter="in" placeholder="Length" style={{ width: 130 }} />
                </Form.Item>
                <Form.Item name="breadth_in" noStyle>
                  <InputNumber min={0} addonAfter="in" placeholder="Breadth" style={{ width: 130 }} />
                </Form.Item>
                <Form.Item
                  name="height_mm"
                  noStyle
                  rules={requireDimensions ? [{ required: true, message: 'Enter a height.' }] : []}
                >
                  <InputNumber min={0} addonAfter="mm" placeholder="Height" style={{ width: 130 }} />
                </Form.Item>
              </Flex>
            </Form.Item>
          )}

          <Form.Item
            label="What should this item be called?"
            name="name"
            tooltip="Shown throughout the app — on pickers, order lines, and reports. Use something recognizable on the factory floor, not an internal code."
            rules={[{ required: true, message: 'Enter an item name.' }]}
          >
            <Input size="large" />
          </Form.Item>
          <Suggestion
            value={suggestedName}
            onUse={() => form.setFieldValue('name', suggestedName)}
          />

          <Form.Item
            label="Item Code"
            name="code"
            tooltip="A short, unique internal reference — your own part number. Fixed once created, since other records point back to this item by it."
            rules={[{ required: true, message: 'Enter an item code.' }]}
          >
            <Input size="large" disabled={isEdit} />
          </Form.Item>
          {!isEdit && (
            <Suggestion
              value={suggestedCode}
              onUse={() => form.setFieldValue('code', suggestedCode)}
            />
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
              <Flex align="center" gap={4}>
                <Form.Item name="manufacturable" valuePropName="checked" noStyle>
                  <Checkbox>Made</Checkbox>
                </Form.Item>
                <Tooltip title="This item can be produced by a Process/Product Route — it's an output of manufacturing.">
                  <InfoCircleOutlined style={{ color: '#8c8c8c', fontSize: 13 }} />
                </Tooltip>
              </Flex>
              <Flex align="center" gap={4}>
                <Form.Item name="stockable" valuePropName="checked" noStyle>
                  <Checkbox>Stocked</Checkbox>
                </Form.Item>
                <Tooltip title="You track an on-hand quantity for this item in inventory.">
                  <InfoCircleOutlined style={{ color: '#8c8c8c', fontSize: 13 }} />
                </Tooltip>
              </Flex>
              <Flex align="center" gap={4}>
                <Form.Item name="sellable" valuePropName="checked" noStyle>
                  <Checkbox>Sold</Checkbox>
                </Form.Item>
                <Tooltip title="This item can appear on an Export Order line and be mapped to a customer.">
                  <InfoCircleOutlined style={{ color: '#8c8c8c', fontSize: 13 }} />
                </Tooltip>
              </Flex>
              <Flex align="center" gap={4}>
                <Form.Item name="purchasable" valuePropName="checked" noStyle>
                  <Checkbox>Bought</Checkbox>
                </Form.Item>
                <Tooltip title="This item is procured from a vendor.">
                  <InfoCircleOutlined style={{ color: '#8c8c8c', fontSize: 13 }} />
                </Tooltip>
              </Flex>
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
      <QuickAddModal
        open={shapeModalOpen}
        title="Add Shape"
        submitting={quickAddSubmitting}
        onCancel={() => setShapeModalOpen(false)}
        onCreate={(name) => void handleCreateShape(name)}
      />
    </div>
  )
}
