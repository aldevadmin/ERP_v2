import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { Alert, Breadcrumb, Button, Card, Form, Input, Select, Switch, Typography } from 'antd'
import { ApiError } from '../../shared/api/http'
import {
  createNamingTemplate,
  getNamingTemplate,
  listItemFieldRules,
  listProductTypes,
  listShapes,
  updateNamingTemplate,
} from './api'
import { applyTemplate, availableNamingTokens, exampleNamingTokens } from './namingTemplate'
import { fieldRulesForClass, isApplicableToClass, ITEM_CLASS_OPTIONS } from './types'
import type {
  ItemClass,
  ItemFieldRule,
  NamingTemplate,
  NamingTemplateFormValues,
  ProductType,
  Shape,
} from './types'

const { Title, Text } = Typography

export default function NamingTemplateFormPage() {
  const { id } = useParams<{ id: string }>()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const location = useLocation()
  const duplicateFrom = (location.state as { duplicateFrom?: NamingTemplate } | null)
    ?.duplicateFrom
  const [form] = Form.useForm<NamingTemplateFormValues>()
  const [loading, setLoading] = useState(isEdit)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [productTypes, setProductTypes] = useState<ProductType[]>([])
  const [shapes, setShapes] = useState<Shape[]>([])
  const [fieldRules, setFieldRules] = useState<ItemFieldRule[]>([])

  const itemClass = Form.useWatch('item_class', form) as ItemClass | undefined
  const rules = itemClass ? fieldRulesForClass(fieldRules, itemClass) : {}
  const showShape = itemClass !== undefined && rules.shape !== 'HIDDEN' && rules.shape !== undefined
  const showProductType =
    itemClass !== undefined && rules.product_type !== 'HIDDEN' && rules.product_type !== undefined

  const availableTokens = availableNamingTokens(itemClass, fieldRules)
    .map((token) => `{${token}}`)
    .join(' ')

  const namePattern = Form.useWatch('name_pattern', form) as string | undefined
  const codePattern = Form.useWatch('code_pattern', form) as string | undefined
  const example = exampleNamingTokens(itemClass, fieldRules)
  const namePreview = namePattern ? applyTemplate(namePattern, example) : null
  const codePreview = codePattern ? applyTemplate(codePattern, example) : null

  useEffect(() => {
    listProductTypes({ isActive: true }).then((response) => setProductTypes(response.results))
    listShapes({ isActive: true }).then((response) => setShapes(response.results))
    listItemFieldRules().then(setFieldRules)
  }, [])

  useEffect(() => {
    if (!id) return
    getNamingTemplate(Number(id))
      .then((template) => form.setFieldsValue(template))
      .catch(() => setError('Could not load this naming template.'))
      .finally(() => setLoading(false))
  }, [id, form])

  // Duplicating: prefill from the source row, but never its id — this is
  // still a create, and the source's exact scope is guaranteed to already
  // be taken (that's the uniqueness rule this same screen enforces), so
  // the user has to change at least Product Type or Shape before Save
  // will succeed. That's expected, not a bug — see the banner below.
  useEffect(() => {
    if (id || !duplicateFrom) return
    const { id: _sourceId, ...values } = duplicateFrom
    form.setFieldsValue(values)
  }, [id, duplicateFrom, form])

  const handleSubmit = async (values: NamingTemplateFormValues) => {
    setError(null)
    setSubmitting(true)
    try {
      if (id) {
        await updateNamingTemplate(Number(id), values)
      } else {
        await createNamingTemplate(values)
      }
      navigate('/naming-templates')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this naming template.')
    } finally {
      setSubmitting(false)
    }
  }

  const pageTitle = isEdit ? 'Edit Naming Template' : 'New Naming Template'

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 12 }}
        items={[
          { title: <Link to="/settings">Settings</Link> },
          { title: <Link to="/naming-templates">Naming Templates</Link> },
          { title: pageTitle },
        ]}
      />
      <Card style={{ maxWidth: 640, margin: '0 auto' }}>
        <Title level={4}>{pageTitle}</Title>
        {!id && duplicateFrom && (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            title="Duplicating a template"
            description="Every field below is copied from the source template. Its exact Item Class/Product Type/Shape combination is already taken, so change at least one of those before saving."
          />
        )}
        {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}
        <Form<NamingTemplateFormValues>
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          disabled={loading || submitting}
          // `name_pattern`/`code_pattern` are `blank=True` but not
          // `null=True` on the backend — left untouched they stay
          // `undefined`, which `jsonBody` turns into an explicit `null`
          // the DB rejects. Seeding '' keeps them real strings from the
          // start (see the identical fix on ItemFormPage's `description`).
          initialValues={{ is_active: true, name_pattern: '', code_pattern: '' }}
        >
          <Form.Item
            label="Item Class"
            name="item_class"
            tooltip="Which class of item this template applies to."
            rules={[{ required: true, message: 'Select an item class.' }]}
          >
            <Select size="large" options={ITEM_CLASS_OPTIONS} />
          </Form.Item>
          {showProductType && (
            <Form.Item
              label="Product Type (optional)"
              name="product_type"
              tooltip="Narrow this template to one Product Type — e.g. a Plate-specific pattern that differs from other Finished Goods. Leave blank to apply to every product type in this class — once one is selected, hover it and click the × that appears to clear it back to blank."
            >
              <Select
                allowClear
                size="large"
                placeholder="All product types"
                options={(itemClass
                  ? productTypes.filter((t) => isApplicableToClass(t, itemClass))
                  : productTypes
                ).map((t) => ({ value: t.id, label: t.name }))}
                showSearch
                optionFilterProp="label"
              />
            </Form.Item>
          )}
          {showShape && (
            <Form.Item
              label="Shape (optional)"
              name="shape"
              tooltip="Narrow this template to one Shape — e.g. a Round-specific pattern, since round items only have one dimension to work with. Independent of Product Type: a round Bowl and a round Cup can share a shape-scoped template even though they're different product types. Leave blank to apply to every shape in this class — once one is selected, hover it and click the × that appears to clear it back to blank."
            >
              <Select
                allowClear
                size="large"
                placeholder="All shapes"
                options={shapes.map((s) => ({ value: s.id, label: s.name }))}
                showSearch
                optionFilterProp="label"
              />
            </Form.Item>
          )}
          <Form.Item
            label="Name Pattern"
            name="name_pattern"
            tooltip="Shown as a suggestion under Item Name, once every token it references is filled in. Prefer {dimension} over raw {length}/{breadth} — it already adapts to round vs. square/rectangular items on its own; {breadth} alone stays empty (and blocks the whole suggestion) for a round item with no breadth."
          >
            <Input size="large" placeholder="e.g. {dimension} {product_type} — {material_type}" />
          </Form.Item>
          {namePattern &&
            (namePreview !== null ? (
              <Text
                type="secondary"
                style={{ display: 'block', marginTop: -16, marginBottom: 16, fontSize: 13 }}
              >
                Example: <Text code>{namePreview}</Text>
              </Text>
            ) : (
              <Text
                type="warning"
                style={{ display: 'block', marginTop: -16, marginBottom: 16, fontSize: 13 }}
              >
                No preview — this pattern uses a token not available for this class (see below).
              </Text>
            ))}
          <Form.Item
            label="Code Pattern"
            name="code_pattern"
            tooltip="Shown as a suggestion under Item Code, same rule as Name Pattern — prefer {dimension} over raw {length}/{breadth} for the same reason."
          >
            <Input
              size="large"
              placeholder="e.g. {material_type_short}_{shape_short}{product_type_short}-{dimension}"
            />
          </Form.Item>
          {codePattern &&
            (codePreview !== null ? (
              <Text
                type="secondary"
                style={{ display: 'block', marginTop: -16, marginBottom: 16, fontSize: 13 }}
              >
                Example: <Text code>{codePreview}</Text>
              </Text>
            ) : (
              <Text
                type="warning"
                style={{ display: 'block', marginTop: -16, marginBottom: 16, fontSize: 13 }}
              >
                No preview — this pattern uses a token not available for this class (see below).
              </Text>
            ))}
          <Text type="secondary" style={{ display: 'block', marginTop: -12, marginBottom: 20 }}>
            Available tokens: <Text code>{availableTokens}</Text>
          </Text>
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
    </div>
  )
}
