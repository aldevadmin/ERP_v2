import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { InfoCircleOutlined } from '@ant-design/icons'
import {
  Alert,
  Breadcrumb,
  Button,
  Card,
  DatePicker,
  Empty,
  Flex,
  Form,
  Input,
  Radio,
  Typography,
} from 'antd'
import dayjs from 'dayjs'
import { ApiError } from '../../shared/api/http'
import { listProducts } from '../products/api'
import type { Product } from '../products/types'
import RouteOutputRoutingForm from './RouteOutputRoutingForm'
import RouteReview from './RouteReview'
import RouteStepsForm from './RouteStepsForm'
import { createProcessRoute, getProcessRoute, saveRouteVersion, updateProcessRoute } from './api'
import { PRODUCT_ROUTE_WIZARD_STEPS } from './types'
import type { ProcessRoute, ProductRouteWizardStepKey, RouteBasicsValues } from './types'

const { Title, Text } = Typography

interface BasicsFormValues {
  name: string
  product: number
  is_default: boolean
  effective_from: dayjs.Dayjs | null
}

export default function ProductRouteFormPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [route, setRoute] = useState<ProcessRoute | null>(null)
  const isEdit = route !== null
  const [form] = Form.useForm<BasicsFormValues>()
  const [currentStep, setCurrentStep] = useState<ProductRouteWizardStepKey>('basics')
  const [loading, setLoading] = useState(Boolean(id))
  const [submitting, setSubmitting] = useState<'draft' | 'continue' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [products, setProducts] = useState<Product[]>([])

  useEffect(() => {
    listProducts({ isActive: true }).then((response) => setProducts(response.results))
  }, [])

  useEffect(() => {
    if (!id) return
    getProcessRoute(Number(id))
      .then((loaded) => {
        setRoute(loaded)
        form.setFieldsValue({
          name: loaded.name,
          product: loaded.product,
          is_default: loaded.is_default,
          effective_from: loaded.effective_from ? dayjs(loaded.effective_from) : null,
        })
      })
      .catch(() => setError('Could not load this route.'))
      .finally(() => setLoading(false))
  }, [id, form])

  const saveBasics = async (mode: 'draft' | 'continue') => {
    let values: BasicsFormValues
    try {
      values = await form.validateFields()
    } catch {
      return
    }
    setError(null)
    setSubmitting(mode)
    try {
      let saved: ProcessRoute
      if (route) {
        await updateProcessRoute(route.id, { name: values.name })
        await saveRouteVersion(route.version_id, {
          is_default: values.is_default,
          effective_from: values.effective_from ? values.effective_from.format('YYYY-MM-DD') : null,
        })
        saved = await getProcessRoute(route.id)
      } else {
        const payload: RouteBasicsValues = {
          name: values.name,
          product: values.product,
          is_default: values.is_default,
          effective_from: values.effective_from ? values.effective_from.format('YYYY-MM-DD') : null,
        }
        saved = await createProcessRoute(payload)
      }
      setRoute(saved)
      if (mode === 'draft') {
        navigate('/product-routes')
      } else {
        setCurrentStep('steps')
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this route.')
    } finally {
      setSubmitting(null)
    }
  }

  const handleSaveDraft = () => {
    if (currentStep === 'basics') {
      void saveBasics('draft')
    } else {
      navigate('/product-routes')
    }
  }

  const currentLabel =
    PRODUCT_ROUTE_WIZARD_STEPS.find((step) => step.key === currentStep)?.label ?? ''

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 12 }}
        items={[
          { title: <Link to="/settings">Settings</Link> },
          { title: <Link to="/product-routes">Product Routes</Link> },
          { title: isEdit ? 'Edit Product Route' : 'Create Product Route' },
        ]}
      />
      <Card style={{ maxWidth: 960, margin: '0 auto' }} styles={{ body: { padding: 0 } }}>
      <Flex
        justify="space-between"
        align="center"
        style={{ padding: '20px 24px', borderBottom: '1px solid #f0f0f0' }}
      >
        <Title level={4} style={{ margin: 0 }}>
          {isEdit ? 'Edit Product Route' : 'Create Product Route'}
        </Title>
        <Button loading={submitting === 'draft'} onClick={handleSaveDraft}>
          Save Draft
        </Button>
      </Flex>
      <Flex align="stretch">
        <div
          style={{ width: 220, borderRight: '1px solid #f0f0f0', padding: '20px 0', flexShrink: 0 }}
        >
          {PRODUCT_ROUTE_WIZARD_STEPS.map((step) => {
            const active = step.key === currentStep
            return (
              <div
                key={step.key}
                role="button"
                onClick={() => setCurrentStep(step.key)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 24px',
                  cursor: 'pointer',
                  color: active ? '#155eef' : 'inherit',
                  fontWeight: active ? 600 : 400,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    border: `2px solid ${active ? '#155eef' : '#d9d9d9'}`,
                    background: active ? '#155eef' : 'transparent',
                    flexShrink: 0,
                  }}
                />
                {step.label}
              </div>
            )
          })}
        </div>
        <div style={{ flex: 1, padding: '24px 32px', minWidth: 0 }}>
          {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}
          {currentStep === 'basics' && (
            <>
              <Text strong style={{ display: 'block', marginBottom: 20, fontSize: 16 }}>
                What should this route be called?
              </Text>
              <Form<BasicsFormValues> form={form} layout="vertical" disabled={loading}>
                <Form.Item
                  label="Route Name"
                  name="name"
                  rules={[{ required: true, message: 'Enter a route name.' }]}
                >
                  <Input size="large" placeholder="e.g. Standard Plate Production" />
                </Form.Item>
                <Form.Item
                  label="Which product / SKU does this route apply to?"
                  name="product"
                  rules={[{ required: true, message: 'Select a product.' }]}
                >
                  <Radio.Group disabled={isEdit}>
                    <Flex vertical gap={8}>
                      {products.map((product) => (
                        <Radio key={product.id} value={product.id}>
                          {product.name} ({product.sku_code})
                        </Radio>
                      ))}
                    </Flex>
                  </Radio.Group>
                </Form.Item>
                <Form.Item
                  label="Is this the default route for this product?"
                  name="is_default"
                  initialValue={false}
                  tooltip={{
                    title:
                      'The default route is the one used automatically for this product when no other route is explicitly selected.',
                    icon: <InfoCircleOutlined />,
                  }}
                >
                  <Radio.Group>
                    <Radio value={true}>Yes</Radio>
                    <Radio value={false}>No</Radio>
                  </Radio.Group>
                </Form.Item>
                <Form.Item label="Effective From (optional)" name="effective_from">
                  <DatePicker style={{ maxWidth: 240 }} format="YYYY-MM-DD" />
                </Form.Item>
              </Form>
              <Flex justify="end">
                <Button
                  type="primary"
                  loading={submitting === 'continue'}
                  onClick={() => void saveBasics('continue')}
                >
                  Save & Continue →
                </Button>
              </Flex>
            </>
          )}
          {currentStep === 'steps' &&
            (route ? (
              <RouteStepsForm
                productName={route.product_name}
                versionId={route.version_id}
                nodes={route.nodes}
                onSaved={(version) =>
                  setRoute((prev) => (prev ? { ...prev, nodes: version.nodes, edges: version.edges } : prev))
                }
                onContinue={() => setCurrentStep('output_routing')}
              />
            ) : (
              <Empty description="Save Basics first to configure Steps." style={{ paddingTop: 48 }} />
            ))}
          {currentStep === 'output_routing' &&
            (route ? (
              <RouteOutputRoutingForm
                versionId={route.version_id}
                nodes={route.nodes}
                edges={route.edges}
                onSaved={(version) =>
                  setRoute((prev) => (prev ? { ...prev, nodes: version.nodes, edges: version.edges } : prev))
                }
                onContinue={() => setCurrentStep('review')}
              />
            ) : (
              <Empty
                description="Save Basics first to configure Output Routing."
                style={{ paddingTop: 48 }}
              />
            ))}
          {currentStep === 'review' &&
            (route ? (
              <RouteReview
                route={route}
                onActivated={(status) =>
                  setRoute((prev) => (prev ? { ...prev, version_status: status as ProcessRoute['version_status'] } : prev))
                }
                onEditStep={(step) => setCurrentStep(step)}
              />
            ) : (
              <Empty description="Save Basics first to review this route." style={{ paddingTop: 48 }} />
            ))}
          {currentStep !== 'basics' &&
            currentStep !== 'steps' &&
            currentStep !== 'output_routing' &&
            currentStep !== 'review' && (
              <Empty description={`${currentLabel} isn't built yet.`} style={{ paddingTop: 48 }} />
            )}
        </div>
      </Flex>
      </Card>
    </div>
  )
}
